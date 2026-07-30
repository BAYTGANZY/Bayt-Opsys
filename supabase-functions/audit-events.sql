-- ============================================================================
-- audit_events — "Vem gjorde vad, när" per ärende och per lägenhet.
--
-- Backs the Historik section at the bottom of /apartments/:id (Info).
-- Run by hand in the Supabase SQL editor. Not part of the Vite build.
-- Safe to re-run in full: every statement is IF NOT EXISTS / OR REPLACE.
--
-- STEP 1 of 3. Then: audit-events-triggers.sql, then audit-events-backfill.sql.
--
-- ---------------------------------------------------------------------------
-- THE ONE DESIGN RULE: an audit row is SELF-CONTAINED. The read path joins
-- nothing.
--
-- This is not style. chat.sql's `profiles_select_for_chat` limits a non-admin
-- to reading admin profiles, their own, and chat co-participants. So a
-- `profiles:created_by(full_name)` join returns NULL for a styrelse user
-- looking at an entreprenör's action — exactly the attribution this feature
-- exists to provide. Every name the UI renders is therefore snapshotted at
-- write time by the stamp trigger below.
--
-- The same reasoning kills foreign keys on entity_id / property_id /
-- apartment_id: an audit trail must outlive the thing it describes.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — READ-ONLY. Run this first and read the output.
--    Both dependencies were created by hand in the dashboard and have no DDL
--    in this repo, so confirm they exist before anything below will work.
--    Expect: is_admin = true (one row), styrelse_properties = true.
-- ---------------------------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM pg_proc  WHERE proname = 'is_admin')              AS has_is_admin,
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'styrelse_properties') AS has_styrelse_properties,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'contacts' AND column_name = 'profile_id')    AS has_contacts_profile_id;


-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHAT was touched. No FK on entity_id: it points at four different tables,
  -- and the row must survive its subject being deleted.
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('issue','inspection','project','apartment')),
  entity_id      UUID NOT NULL,
  entity_title   TEXT,

  -- WHERE it belongs. Denormalized deliberately: property_id backs the styrelse
  -- RLS check, apartment_id backs the per-apartment feed. A NULL apartment_id
  -- is normal and expected for projekt — the projects table has no
  -- apartment_id column at all (verified against the live DB: 42703) — and for
  -- building-level ärenden.
  property_id    UUID,
  apartment_id   UUID,

  -- WHAT happened
  action         TEXT NOT NULL CHECK (action IN
                   ('created','opened','closed','status_changed','updated','deleted')),
  field          TEXT,        -- NULL unless action = 'updated'; raw column name
  old_value      TEXT,        -- HUMAN-READABLE. FK columns already resolved to a name.
  new_value      TEXT,
  lifecycle_from TEXT,        -- vilande | oppet | avslutat
  lifecycle_to   TEXT,

  -- One save that changes three fields writes three rows sharing a batch_id,
  -- so the UI collapses them into a single card instead of guessing from
  -- timestamps.
  batch_id       UUID NOT NULL DEFAULT gen_random_uuid(),

  -- WHO did it. Stamped server-side — see audit_events_stamp_actor().
  actor_profile_id UUID,      -- the login
  actor_contact_id UUID,      -- the contacts row linked to that login: the
                              -- entreprenör identity admins pick in AnsvarigDropdown
  actor_name       TEXT NOT NULL DEFAULT 'Okänd',
  actor_company    TEXT,
  actor_role       TEXT,      -- admin | styrelse | entreprenor | system | boende

  -- Raw ids and provenance. Never render from this.
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The per-apartment feed: always filtered on apartment_id, always sorted
-- created_at DESC.
CREATE INDEX IF NOT EXISTS audit_events_apartment_idx
  ON audit_events (apartment_id, created_at DESC) WHERE apartment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_property_idx
  ON audit_events (property_id, created_at DESC) WHERE property_id IS NOT NULL;

-- "history of this one ärende", and the backfill's NOT EXISTS guard.
CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON audit_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_batch_idx ON audit_events (batch_id);


-- ---------------------------------------------------------------------------
-- 2. lifecycle_of() — MUST stay in sync with LIFECYCLE_OF in
--    src/lib/issue-tokens.ts. Same duplication contract as
--    normalizeTrappa ↔ submit-felanmalan.ts: if one changes, both change in
--    the same commit.
--
--    This also normalizes an existing inconsistency: OppnaArendeButton writes
--    status 'oppet' for issues (not an issue_status enum member) while
--    dag-rapport writes 'pagande'. Both map to 'oppet' here, so the feed reads
--    consistently no matter which writer produced the row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_of(p_status TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'ny'         THEN 'vilande'
    WHEN 'vilande'    THEN 'vilande'
    WHEN 'pagande'    THEN 'oppet'
    WHEN 'oppet'      THEN 'oppet'
    WHEN 'vantar'     THEN 'oppet'
    WHEN 'klar'       THEN 'avslutat'
    WHEN 'fakturerad' THEN 'avslutat'
    WHEN 'stangd'     THEN 'avslutat'
    WHEN 'avslutat'   THEN 'avslutat'
    ELSE NULL
  END;
$$;


-- ---------------------------------------------------------------------------
-- 3. audit_label() — resolves an FK column's value to the name a human should
--    read, so the stored row needs no read-time join (the design rule above).
--    SECURITY DEFINER so it can read contacts/profiles regardless of who is
--    saving.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_label(p_field TEXT, p_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v TEXT;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RETURN NULL; END IF;
  CASE p_field
    WHEN 'assigned_contact_id' THEN SELECT full_name INTO v FROM contacts   WHERE id = p_id::uuid;
    WHEN 'assigned_to'         THEN SELECT full_name INTO v FROM profiles   WHERE id = p_id::uuid;
    WHEN 'contractor_id'       THEN SELECT full_name INTO v FROM profiles   WHERE id = p_id::uuid;
    WHEN 'property_id'         THEN SELECT name      INTO v FROM properties WHERE id = p_id::uuid;
    WHEN 'apartment_id'        THEN SELECT 'Lgh ' || apartment_number || COALESCE(' ' || NULLIF(trappa,''), '')
                                      INTO v FROM apartments WHERE id = p_id::uuid;
    ELSE RETURN p_id;
  END CASE;
  RETURN COALESCE(v, p_id);
EXCEPTION WHEN OTHERS THEN
  -- A malformed uuid must not abort the caller's save.
  RETURN p_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. Actor stamping.
--    A client-supplied actor_name is forgeable and relies on every call site
--    remembering. SECURITY DEFINER lets this read profiles/contacts past RLS,
--    and identity comes from auth.uid() — the client never supplies it.
--
--    Snapshotting is also correct on the merits: someone who later leaves,
--    changes surname, or has their profile removed must not silently rewrite
--    history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_events_stamp_actor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name TEXT; v_email TEXT; v_role TEXT;
  v_contact_id UUID; v_company TEXT;
BEGIN
  -- auth.uid() is NULL for service_role (the submit-felanmalan Edge Function)
  -- and for the SQL editor (the backfill). Both are trusted and supply their
  -- own actor_* values, so leave the row alone. `anon` has no INSERT grant,
  -- so this is not a hole.
  IF auth.uid() IS NULL THEN
    NEW.actor_name := COALESCE(NULLIF(NEW.actor_name, ''), 'Systemet');
    NEW.actor_role := COALESCE(NEW.actor_role, 'system');
    RETURN NEW;
  END IF;

  NEW.actor_profile_id := auth.uid();   -- never trust a client-supplied actor

  SELECT full_name, email, role INTO v_full_name, v_email, v_role
    FROM profiles WHERE id = auth.uid();
  NEW.actor_name := COALESCE(NULLIF(v_full_name, ''), v_email, 'Okänd');
  NEW.actor_role := v_role;

  -- The login → contact link (contacts.profile_id), same as useMyContactId.ts.
  -- NOTE: this column is populated BY HAND today — there is no invite-time
  -- linking — so an unlinked entreprenör gets NULL company and renders as
  -- just their profile name.
  SELECT id, company INTO v_contact_id, v_company
    FROM contacts WHERE profile_id = auth.uid() LIMIT 1;
  NEW.actor_contact_id := v_contact_id;
  NEW.actor_company    := v_company;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the write that triggered us.
  NEW.actor_name := COALESCE(NULLIF(NEW.actor_name, ''), 'Okänd');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_stamp_actor_trg ON audit_events;
CREATE TRIGGER audit_events_stamp_actor_trg
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_stamp_actor();


-- ---------------------------------------------------------------------------
-- 5. RLS helpers.
--    Every membership test goes through a SECURITY DEFINER function, never a
--    bare subquery — the lesson chat.sql already paid for:
--      a) 42P17: the moment issues/contacts get policies that read
--         audit_events, a bare subquery here re-enters that policy and
--         Postgres aborts with "infinite recursion detected in policy".
--      b) "May I see this?" must be evaluated against ALL rows, not just the
--         rows the caller can already see, or the test is circular.
-- ---------------------------------------------------------------------------

-- styrelse: buildings they are attached to.
CREATE OR REPLACE FUNCTION public.can_see_property(p_property_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM styrelse_properties
    WHERE profile_id = auth.uid() AND property_id = p_property_id
  );
$$;

-- entreprenör: apartments where they hold at least one assignment.
-- Per the product decision, ONE assignment grants the WHOLE apartment's
-- history — including other contractors' ärenden and edits to the unit.
-- projects are absent because that table has no apartment_id.
CREATE OR REPLACE FUNCTION public.has_apartment_assignment(p_apartment_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_apartment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.profile_id = auth.uid()
      AND (
        EXISTS (SELECT 1 FROM issues i
                 WHERE i.apartment_id = p_apartment_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n
                 WHERE n.apartment_id = p_apartment_id AND n.assigned_contact_id = c.id)
      )
  );
$$;

-- entreprenör: the ärende itself is theirs. Covers projekt (no apartment) and
-- building-level ärenden that carry no apartment_id.
CREATE OR REPLACE FUNCTION public.is_my_arende(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.profile_id = auth.uid() AND (
         (p_entity_type = 'issue'      AND EXISTS (SELECT 1 FROM issues      x WHERE x.id = p_entity_id AND x.assigned_contact_id = c.id))
      OR (p_entity_type = 'inspection' AND EXISTS (SELECT 1 FROM inspections x WHERE x.id = p_entity_id AND x.assigned_contact_id = c.id))
      OR (p_entity_type = 'project'    AND EXISTS (SELECT 1 FROM projects    x WHERE x.id = p_entity_id AND x.assigned_contact_id = c.id))
    )
  );
$$;


-- ---------------------------------------------------------------------------
-- 6. RLS policy + grants
-- ---------------------------------------------------------------------------
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select ON audit_events;
CREATE POLICY audit_events_select ON audit_events
FOR SELECT USING (
  is_admin()
  OR can_see_property(property_id)
  OR has_apartment_assignment(apartment_id)
  OR is_my_arende(entity_type, entity_id)
);

GRANT SELECT ON audit_events TO authenticated;

-- No INSERT/UPDATE/DELETE policy for `authenticated`, on purpose:
--   * every write arrives via the SECURITY DEFINER triggers in step 2 or via
--     service_role, so a client cannot fabricate history;
--   * and an audit log an admin can edit is not an audit log — note there is
--     deliberately NO `FOR ALL` policy, not even for is_admin().
REVOKE INSERT, UPDATE, DELETE ON audit_events FROM authenticated;
REVOKE ALL ON audit_events FROM anon;


-- ---------------------------------------------------------------------------
-- 7. VERIFY — READ-ONLY. Should return 4 policies/indexes and the 5 functions.
-- ---------------------------------------------------------------------------
SELECT 'index' AS kind, indexname AS name FROM pg_indexes WHERE tablename = 'audit_events'
UNION ALL
SELECT 'policy', policyname FROM pg_policies WHERE tablename = 'audit_events'
UNION ALL
SELECT 'function', proname FROM pg_proc
WHERE proname IN ('lifecycle_of','audit_label','audit_events_stamp_actor',
                  'can_see_property','has_apartment_assignment','is_my_arende')
ORDER BY 1, 2;
