-- ============================================================================
-- entreprenör read scope — låt en entreprenör läsa FASTIGHETEN och LÄGENHETEN
-- som deras tilldelade ärende sitter i.
--
-- Run by hand in the Supabase SQL editor. Not part of the Vite build.
-- Safe to re-run in full: every statement is OR REPLACE / DROP … IF EXISTS /
-- IF NOT EXISTS. No prerequisites — it creates both helper functions it needs.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS FIXES
--
-- Fastigheter, Felanmälningar, Besiktningar and Projekt are building pickers:
-- the page asks for the buildings, keeps the ones the role is entitled to, and
-- draws one card per building (see useVisibleProperties.ts). Step two was
-- correct for an entreprenör — their building set is derived from the ärenden
-- assigned to their linked contact — but step one returned NOTHING, because the
-- SELECT rules on `properties` were written by hand for admin (and styrelse)
-- and no rule ever said "an entreprenör may read a building where they have an
-- assigned job". Empty list × correct filter = "Inga fastigheter hittades" on
-- all four pages.
--
-- Dag Rapport was the only view that worked because it is the only one that
-- never reads `properties` — it reads the ärenden directly by assignment.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SAFE
--
-- Permissive SELECT policies are OR-ed together. Adding the two policies below
-- can only WIDEN access, and only for a login whose auth.uid() matches a
-- contacts.profile_id that is assigned_contact_id on an ärende. Existing admin,
-- styrelse and anon policies (felanmalan-public-read.sql) are left untouched,
-- nothing here grants INSERT/UPDATE/DELETE, and the RLS on
-- issues/inspections/projects is not changed at all.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — READ-ONLY. Run this first and read the output.
--
--    has_apartment_assignment_fn = false is FINE: audit-events.sql has not been
--    run on this project and section 1a below creates the function itself, with
--    the identical definition. This file has no prerequisites.
--    has_contacts_profile_id MUST be true — that column is the whole mechanism.
--
--    The policy listing is the evidence for the diagnosis above: expect the
--    SELECT rules on `properties` to be admin-scoped plus the anon felanmälan
--    one, and nothing keyed on contacts.profile_id. If a rule already lets any
--    authenticated user read buildings, STOP — the empty grids have another
--    cause and this file is a no-op.
-- ---------------------------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_apartment_assignment') AS has_apartment_assignment_fn,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'contacts' AND column_name = 'profile_id')     AS has_contacts_profile_id;

SELECT tablename, policyname, roles, cmd, qual
  FROM pg_policies
 WHERE tablename IN ('properties', 'apartments')
 ORDER BY tablename, policyname;


-- ---------------------------------------------------------------------------
-- 1a. has_apartment_assignment — "har jag ett ärende i den här lägenheten?"
--
--     ⚠ THIS IS A VERBATIM COPY of the function in audit-events.sql, which has
--     NOT been run on this project (the preflight above returns false for it).
--     Defining it here means this file has no prerequisites and the two can be
--     applied in either order: both use CREATE OR REPLACE with the same
--     signature and the same body, so whichever runs last is a no-op change.
--
--     ⚠ THE TWO DEFINITIONS MUST STAY IDENTICAL — same contract as
--     normalizeTrappa ↔ submit-felanmalan.ts and lifecycle_of() ↔ LIFECYCLE_OF.
--     If they drift, the Historik feed and the apartment read policy start
--     disagreeing about who may see what, silently.
--
--     Projects are absent on purpose: `projects` has no apartment_id column at
--     all, so a projekt can never grant access to a lägenhet. Buildings are a
--     different matter — see 1b.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 1b. RLS helper — "har jag ett ärende i den här fastigheten?"
--
--    SECURITY DEFINER is not optional, for the two reasons audit-events.sql
--    already paid for:
--      a) 42P17: a bare subquery inside a policy on `properties` re-enters the
--         policies of the tables it reads the moment those get rules that
--         reference properties, and Postgres aborts with "infinite recursion
--         detected in policy".
--      b) "May I see this building?" must be answered against ALL ärenden, not
--         just the ärenden the caller can already see, or the test is circular.
--
--    Mirrors has_apartment_assignment() above (and is_my_arende() in
--    audit-events.sql), with one deliberate difference: PROJECTS COUNT HERE.
--    A projekt is building-level (the projects table has no apartment_id column
--    at all), so it can never grant apartment access — but it absolutely must
--    grant access to the building it runs in, or an entreprenör assigned only to
--    a projekt sees an empty Projekt page.
--
--    Deliberately NOT filtered on ärendestatus or contacts.active: the client's
--    useVisibleProperties does not filter on them either, and the two must
--    agree or the grid and the database disagree about what exists. An
--    avslutat ärende still keeps the building readable — the history has to
--    stay reachable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_property_assignment(p_property_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.profile_id = auth.uid()
      AND (
        EXISTS (SELECT 1 FROM issues      i WHERE i.property_id = p_property_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n WHERE n.property_id = p_property_id AND n.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM projects    x WHERE x.property_id = p_property_id AND x.assigned_contact_id = c.id)
      )
  );
$$;

COMMENT ON FUNCTION public.has_property_assignment(UUID) IS
  'True när inloggad användares kopplade contacts-rad är ansvarig för minst ett ärende (felanmälan, besiktning eller projekt) i fastigheten. Speglar useVisibleProperties.ts — ändras den ena måste den andra ändras.';


-- ---------------------------------------------------------------------------
-- 1c. Indexes for the lookups above.
--     The policy calls the helper once per candidate building row, and the
--     frontend filters on assigned_contact_id on every single entreprenör page
--     (useMyArenden, useVisibleProperties, useMyAssignedApartmentIds, IssuesTab).
--     Without these it is a sequential scan per row.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS issues_assigned_contact_property_idx
  ON issues (assigned_contact_id, property_id) WHERE assigned_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inspections_assigned_contact_property_idx
  ON inspections (assigned_contact_id, property_id) WHERE assigned_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_assigned_contact_property_idx
  ON projects (assigned_contact_id, property_id) WHERE assigned_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_profile_id_idx
  ON contacts (profile_id) WHERE profile_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 2. Policies
--
--    properties: read the building you have work in.
--    apartments: read the unit you hold an ärende in. This is what puts
--    "Lgh 12 · Trappa B" on the Dag Rapport row (useMyArenden.ts already
--    assumes the rule exists) and what makes Lägenheter work.
--
--    TO authenticated, not TO a role name: the helper's
--    contacts.profile_id = auth.uid() test is the restriction. A login with no
--    linked contact matches nothing, so nothing widens for admin or styrelse —
--    they keep passing on their own policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS entreprenor_read_assigned_properties ON properties;
CREATE POLICY entreprenor_read_assigned_properties ON properties
FOR SELECT TO authenticated
USING (has_property_assignment(id));

DROP POLICY IF EXISTS entreprenor_read_assigned_apartments ON apartments;
CREATE POLICY entreprenor_read_assigned_apartments ON apartments
FOR SELECT TO authenticated
USING (has_apartment_assignment(id));


-- ---------------------------------------------------------------------------
-- 3. VERIFY — READ-ONLY. Expect the two new policies plus the pre-existing
--    admin/styrelse/anon ones (they must all still be listed — if one is
--    missing, something else dropped it, not this file), and the function.
-- ---------------------------------------------------------------------------
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE tablename IN ('properties', 'apartments')
 ORDER BY tablename, policyname;

SELECT proname, prosecdef AS is_security_definer
  FROM pg_proc
 WHERE proname IN ('has_property_assignment', 'has_apartment_assignment')
 ORDER BY proname;


-- ---------------------------------------------------------------------------
-- 4. Spot-check a real entreprenör — READ-ONLY. Paste their profiles.id.
--    Expect one row per building they have an assigned ärende in. If it returns
--    nothing, the login is not linked to a contacts row (contacts.profile_id is
--    still populated BY HAND, see audit-events.sql) — that, not RLS, is then the
--    reason their pages are empty, and Dag Rapport would be empty too.
-- ---------------------------------------------------------------------------
-- SELECT DISTINCT p.id, p.name
--   FROM properties p
--   JOIN contacts c ON c.profile_id = '<PROFILE-UUID-HÄR>'
--  WHERE EXISTS (SELECT 1 FROM issues      i WHERE i.property_id = p.id AND i.assigned_contact_id = c.id)
--     OR EXISTS (SELECT 1 FROM inspections n WHERE n.property_id = p.id AND n.assigned_contact_id = c.id)
--     OR EXISTS (SELECT 1 FROM projects    x WHERE x.property_id = p.id AND x.assigned_contact_id = c.id)
--  ORDER BY p.name;
