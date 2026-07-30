-- ============================================================================
-- audit_events — seed history so the feature launches with real content.
--
-- STEP 3 of 3. Requires audit-events.sql and audit-events-triggers.sql.
-- Run by hand in the Supabase SQL editor.
--
-- IDEMPOTENT: every INSERT is NOT EXISTS-guarded. Re-run freely; the counts
-- should not move on a second run.
--
-- No trigger disabling is needed. audit_events_stamp_actor() short-circuits
-- when auth.uid() IS NULL — which is the case in the SQL editor — so the
-- actor_* values supplied below are preserved as written.
--
-- ---------------------------------------------------------------------------
-- WHAT CAN AND CANNOT BE RECOVERED
--
-- CAN:  felanmälan lifecycle, from issue_status_history (issue_id → issues.
--       apartment_id), plus "Skapade" rows derived from created_at timestamps.
--
-- CANNOT, and the timeline simply starts at trigger-install for these:
--   * Besiktning and projekt lifecycle history. OppnaArendeButton /
--     AvslutaArendeButton write arende_status but never inserted a history
--     row. Their only trace is logbook_entries with
--     event_type='arende_status_andring' and free-text content of the form
--     "<title> (<old> → <new>)" — property-scoped only, so they cannot be
--     attributed to an apartment even by parsing.
--   * All field edits (priority, deadline, Ansvarig). Nothing was ever
--     recorded anywhere; there is no updated_by column in the schema.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Lifecycle history for felanmälningar, from issue_status_history.
--    lifecycle_of() normalizes the existing 'oppet' vs 'pagande' split so the
--    backfilled feed reads consistently regardless of which writer produced
--    the source row.
--
--    ::text on every status is REQUIRED, not tidiness. issue_status_history
--    .old_status/.new_status are the `issue_status` ENUM, and Postgres does not
--    apply an I/O conversion cast when resolving a function call — so
--    lifecycle_of(h.new_status) fails with 42883 "function
--    lifecycle_of(issue_status) does not exist". The triggers never hit this
--    because they read their values out of JSONB, which is already text.
--    (The bare h.old_status/h.new_status passed to the old_value/new_value
--    columns are fine: assignment context DOES allow the enum→text cast.)
--
--    Same reason for p.role::text everywhere below. profiles.role is the
--    `user_role` ENUM, so COALESCE(p.role, 'system') makes Postgres resolve
--    the whole expression as user_role and then reject 'system' with 22P02 —
--    'system' and 'boende' are audit_events.actor_role values, not login roles.
-- ---------------------------------------------------------------------------
INSERT INTO audit_events (
  entity_type, entity_id, entity_title, property_id, apartment_id,
  action, field, old_value, new_value, lifecycle_from, lifecycle_to,
  actor_profile_id, actor_name, actor_role, created_at, meta)
SELECT
  'issue', h.issue_id, i.title, i.property_id, i.apartment_id,
  CASE
    WHEN lifecycle_of(h.new_status::text) = 'oppet'
     AND lifecycle_of(h.old_status::text) IS DISTINCT FROM 'oppet'    THEN 'opened'
    WHEN lifecycle_of(h.new_status::text) = 'avslutat'
     AND lifecycle_of(h.old_status::text) IS DISTINCT FROM 'avslutat' THEN 'closed'
    ELSE 'status_changed'
  END,
  'status', h.old_status::text, h.new_status::text,
  lifecycle_of(h.old_status::text), lifecycle_of(h.new_status::text),
  h.changed_by,
  COALESCE(NULLIF(p.full_name, ''), p.email, 'Okänd'),
  COALESCE(p.role::text, 'system'),
  -- issue_status_history stamps `changed_at`, not created_at — it pairs with
  -- changed_by. The app never writes it; it is a column default.
  h.changed_at,
  jsonb_build_object('backfilled_from', 'issue_status_history', 'source_id', h.id)
FROM issue_status_history h
JOIN issues i ON i.id = h.issue_id
LEFT JOIN profiles p ON p.id = h.changed_by
WHERE NOT EXISTS (
  SELECT 1 FROM audit_events a WHERE a.meta->>'source_id' = h.id::text
);


-- ---------------------------------------------------------------------------
-- 2. "Skapade" for existing felanmälningar.
--    A public-form submission has no login behind it, so credit the resident.
-- ---------------------------------------------------------------------------
INSERT INTO audit_events (
  entity_type, entity_id, entity_title, property_id, apartment_id,
  action, actor_profile_id, actor_name, actor_role, created_at, meta)
SELECT
  'issue', i.id, i.title, i.property_id, i.apartment_id, 'created',
  i.created_by,
  COALESCE(NULLIF(p.full_name, ''), NULLIF(i.reporter_name, ''), 'Systemet'),
  COALESCE(p.role::text, CASE WHEN i.submission_source = 'public_form' THEN 'boende' ELSE 'system' END),
  i.created_at,
  jsonb_build_object('backfilled_from', 'issues')
FROM issues i
LEFT JOIN profiles p ON p.id = i.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM audit_events a
  WHERE a.entity_type = 'issue' AND a.entity_id = i.id AND a.action = 'created'
);


-- ---------------------------------------------------------------------------
-- 3. "Skapade" for existing besiktningar.
-- ---------------------------------------------------------------------------
INSERT INTO audit_events (
  entity_type, entity_id, entity_title, property_id, apartment_id,
  action, actor_profile_id, actor_name, actor_role, created_at, meta)
SELECT
  'inspection', n.id, n.inspection_type, n.property_id, n.apartment_id, 'created',
  n.created_by,
  COALESCE(NULLIF(p.full_name, ''), 'Systemet'),
  COALESCE(p.role::text, 'system'),
  n.created_at,
  jsonb_build_object('backfilled_from', 'inspections')
FROM inspections n
LEFT JOIN profiles p ON p.id = n.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM audit_events a
  WHERE a.entity_type = 'inspection' AND a.entity_id = n.id AND a.action = 'created'
);


-- ---------------------------------------------------------------------------
-- 4. "Skapade" for existing lägenheter.
--    created_via = 'public_form' marks a unit the felanmälan Edge Function
--    invented because no (property_id, apartment_number, trappa) matched —
--    i.e. possibly a resident's typo. This is the first time that column is
--    ever surfaced to a human.
-- ---------------------------------------------------------------------------
INSERT INTO audit_events (
  entity_type, entity_id, entity_title, property_id, apartment_id,
  action, actor_profile_id, actor_name, actor_role, created_at, meta)
SELECT
  'apartment', a.id,
  'Lgh ' || a.apartment_number || COALESCE(' ' || NULLIF(a.trappa, ''), ''),
  a.property_id, a.id, 'created',
  a.created_by,
  CASE WHEN a.created_via = 'public_form' THEN 'Boende via felanmälan'
       ELSE COALESCE(NULLIF(p.full_name, ''), 'Systemet') END,
  CASE WHEN a.created_via = 'public_form' THEN 'boende'
       ELSE COALESCE(p.role::text, 'system') END,
  a.created_at,
  jsonb_build_object('backfilled_from', 'apartments', 'created_via', a.created_via)
FROM apartments a
LEFT JOIN profiles p ON p.id = a.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM audit_events e
  WHERE e.entity_type = 'apartment' AND e.entity_id = a.id AND e.action = 'created'
);


-- ---------------------------------------------------------------------------
-- 5. VERIFY — READ-ONLY. Run, note the numbers, re-run step 1-4, run again:
--    the numbers must be identical.
-- ---------------------------------------------------------------------------
SELECT entity_type, action, count(*) AS antal
FROM audit_events
GROUP BY 1, 2
ORDER BY 1, 2;

-- Spot-check one apartment's feed the way the UI will read it:
-- SELECT created_at, entity_type, action, field, old_value, new_value, actor_name, actor_role
-- FROM audit_events WHERE apartment_id = '<lägenhets-id>' ORDER BY created_at DESC;

-- Which apartments were invented by the public form (possible resident typos)?
-- SELECT e.entity_id, e.entity_title, e.created_at
-- FROM audit_events e
-- WHERE e.entity_type = 'apartment' AND e.meta->>'created_via' = 'public_form'
-- ORDER BY e.created_at DESC;
