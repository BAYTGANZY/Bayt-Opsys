-- ============================================================================
-- audit_events — the writers.
--
-- STEP 2 of 3. Requires audit-events.sql to have been run first.
-- Run by hand in the Supabase SQL editor. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY TRIGGERS AND NOT CLIENT CODE
--
-- Client-side audit discipline has a demonstrated 100% failure rate in this
-- codebase. Before this change: logEvent was called with property_id only in
-- all three status writers, so status changes were structurally invisible in
-- the apartment Tidslinje; issue_status_history is written from three places
-- and read from none; and every existing audit write is fire-and-forget
-- (logbook.ts swallows all errors, dag-rapport used .then(()=>null,()=>null)).
--
-- A trigger is one artifact instead of ~12 call sites, is atomic with the
-- change it records, and covers submit-felanmalan.ts for free — a hand-deployed
-- Edge Function that has already broken twice.
--
-- The cost is that lifecycle_of() duplicates LIFECYCLE_OF from
-- src/lib/issue-tokens.ts in SQL. Accepted, with the same "MUST stay in sync"
-- contract as normalizeTrappa ↔ submit-felanmalan.ts.
--
-- TWO NON-NEGOTIABLES, both encoded below:
--   1. An explicit column allowlist per table. issues.$id.tsx,
--      inspections.$id.tsx and projects.$id.tsx all fire update({viewed_at})
--      ON MOUNT — without an allowlist, merely OPENING a detail page would
--      write an audit row. `viewed_at` and `updated_at` appear in no allowlist.
--   2. EXCEPTION WHEN OTHERS around the whole body. A trigger that throws
--      aborts the user's save. An audit failure must degrade to no-logging,
--      never block a real edit.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- audit_log_changes()
--   TG_ARGV[0] = entity_type ('issue'|'inspection'|'project'|'apartment')
--   TG_ARGV[1] = comma-separated column allowlist for 'updated' rows
--   TG_ARGV[2] = the LIFECYCLE column, or '' if the table has none.
--                issues        → 'status'
--                inspections   → 'arende_status'
--                projects      → 'arende_status'
--                apartments    → '' (no lifecycle)
--                NOTE: inspections.status and projects.status are NOT the
--                lifecycle (they hold aktiv/forfallen/klar and
--                planerad/aktiv/pausad/...). Don't pass them here.
--                A column must never appear in BOTH argv[1] and argv[2], or
--                every transition writes two rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity TEXT   := TG_ARGV[0];
  v_fields TEXT[] := string_to_array(TG_ARGV[1], ',');
  v_lc_col TEXT   := NULLIF(TG_ARGV[2], '');
  o JSONB; n JSONB; r JSONB;
  f TEXT; ov TEXT; nv TEXT;
  v_batch UUID := gen_random_uuid();
  v_prop UUID; v_apt UUID; v_title TEXT; v_eid UUID;
  v_from TEXT; v_to TEXT; v_action TEXT;
BEGIN
  o := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  n := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  r := COALESCE(n, o);

  v_eid  := (r->>'id')::UUID;
  v_prop := NULLIF(r->>'property_id','')::UUID;
  -- For an apartment row the entity IS the apartment; for ärenden it's the FK.
  v_apt  := CASE WHEN v_entity = 'apartment' THEN v_eid
                 ELSE NULLIF(r->>'apartment_id','')::UUID END;
  v_title := COALESCE(
    NULLIF(r->>'title',''),
    NULLIF(r->>'inspection_type',''),
    NULLIF('Lgh ' || COALESCE(r->>'apartment_number','') ||
           COALESCE(' ' || NULLIF(r->>'trappa',''), ''), 'Lgh ')
  );

  ---------------------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_events (
      entity_type, entity_id, entity_title, property_id, apartment_id,
      action, batch_id, actor_name, actor_role, created_at, meta)
    VALUES (
      v_entity, v_eid, v_title, v_prop, v_apt, 'created', v_batch,
      -- A public felanmälan runs as service_role (auth.uid() IS NULL), so the
      -- stamp trigger won't resolve a login. Credit the resident instead.
      CASE WHEN r->>'submission_source' = 'public_form'
             OR r->>'created_via'       = 'public_form'
           THEN COALESCE(NULLIF(r->>'reporter_name',''), 'Boende')
           ELSE NULL END,
      CASE WHEN r->>'submission_source' = 'public_form'
             OR r->>'created_via'       = 'public_form'
           THEN 'boende' ELSE NULL END,
      now(),
      CASE WHEN r->>'created_via' = 'public_form'
           THEN jsonb_build_object('created_via','public_form')
           ELSE '{}'::jsonb END);
    RETURN NEW;
  END IF;

  ---------------------------------------------------------------------------
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_events (
      entity_type, entity_id, entity_title, property_id, apartment_id,
      action, batch_id)
    VALUES (v_entity, v_eid, v_title, v_prop, v_apt, 'deleted', v_batch);
    RETURN OLD;
  END IF;

  ---------------------------------------------------------------------------
  -- UPDATE. Lifecycle transition first, so it reads as the headline event.
  IF v_lc_col IS NOT NULL AND (o->>v_lc_col) IS DISTINCT FROM (n->>v_lc_col) THEN
    v_from := lifecycle_of(o->>v_lc_col);
    v_to   := lifecycle_of(n->>v_lc_col);
    v_action := CASE
      WHEN v_to = 'oppet'    AND v_from IS DISTINCT FROM 'oppet'    THEN 'opened'
      WHEN v_to = 'avslutat' AND v_from IS DISTINCT FROM 'avslutat' THEN 'closed'
      ELSE 'status_changed'
    END;
    INSERT INTO audit_events (
      entity_type, entity_id, entity_title, property_id, apartment_id,
      action, field, old_value, new_value, lifecycle_from, lifecycle_to,
      batch_id, meta)
    VALUES (
      v_entity, v_eid, v_title, v_prop, v_apt, v_action, v_lc_col,
      o->>v_lc_col, n->>v_lc_col, v_from, v_to, v_batch,
      jsonb_build_object('lifecycle_column', v_lc_col));
  END IF;

  -- Then one row per allowlisted column that actually changed. One row per
  -- field (not a JSONB blob) so the UI renders one line per change and
  -- PostgREST can filter on `field`; batch_id groups them back together.
  FOREACH f IN ARRAY v_fields LOOP
    CONTINUE WHEN f = '' OR f = v_lc_col;
    CONTINUE WHEN (o->>f) IS NOT DISTINCT FROM (n->>f);
    ov := audit_label(f, o->>f);
    nv := audit_label(f, n->>f);
    INSERT INTO audit_events (
      entity_type, entity_id, entity_title, property_id, apartment_id,
      action, field, old_value, new_value, batch_id, meta)
    VALUES (
      v_entity, v_eid, v_title, v_prop, v_apt, 'updated', f, ov, nv, v_batch,
      jsonb_build_object('old_id', o->>f, 'new_id', n->>f));
  END LOOP;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Degrade to no-logging. Never abort the user's save.
  RAISE WARNING 'audit_log_changes failed for % %: %', v_entity, v_eid, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ---------------------------------------------------------------------------
-- Attach. ATTACH ONE TABLE AT A TIME and verify between each — start with
-- apartments (lowest traffic). After each one:
--   * save that entity in the UI            → rows appear
--   * merely OPEN a detail page             → ZERO new rows (the viewed_at check)
--   * confirm the save still succeeds
-- ---------------------------------------------------------------------------

-- 1) apartments — no lifecycle column.
DROP TRIGGER IF EXISTS audit_apartments_trg ON apartments;
CREATE TRIGGER audit_apartments_trg
AFTER INSERT OR UPDATE OR DELETE ON apartments
FOR EACH ROW EXECUTE FUNCTION audit_log_changes('apartment',
  'apartment_number,trappa,floor,area_sqm,status,tenant_name,tenant_phone,tenant_email,move_in_date,move_out_date,notes',
  '');

-- 2) issues — lifecycle lives in `status` (the issue_status enum).
DROP TRIGGER IF EXISTS audit_issues_trg ON issues;
CREATE TRIGGER audit_issues_trg
AFTER INSERT OR UPDATE OR DELETE ON issues
FOR EACH ROW EXECUTE FUNCTION audit_log_changes('issue',
  'title,description,category,priority,deadline,assigned_to,assigned_contact_id,property_id,apartment_id,trappa',
  'status');

-- 3) inspections — lifecycle is `arende_status`; `status` is a plain
--    aktiv/forfallen/klar display column and is audited as an ordinary field.
DROP TRIGGER IF EXISTS audit_inspections_trg ON inspections;
CREATE TRIGGER audit_inspections_trg
AFTER INSERT OR UPDATE OR DELETE ON inspections
FOR EACH ROW EXECUTE FUNCTION audit_log_changes('inspection',
  'inspection_type,inspector,interval_months,notes,status,last_completed_date,next_due_date,apartment_id,trappa,assigned_contact_id,property_id',
  'arende_status');

-- 4) projects — building-level only; projects has NO apartment_id column, so
--    these rows always land with apartment_id NULL and surface on the
--    building's Historik, never in an apartment feed.
DROP TRIGGER IF EXISTS audit_projects_trg ON projects;
CREATE TRIGGER audit_projects_trg
AFTER INSERT OR UPDATE OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION audit_log_changes('project',
  'title,description,status,budget,start_date,end_date,assigned_contact_id,property_id',
  'arende_status');


-- ---------------------------------------------------------------------------
-- VERIFY — READ-ONLY. Expect four rows.
-- ---------------------------------------------------------------------------
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgname LIKE 'audit_%_trg' AND NOT t.tgisinternal
ORDER BY 1;

-- Then, after exercising the UI:
--   SELECT entity_type, action, count(*) FROM audit_events GROUP BY 1,2 ORDER BY 1,2;
