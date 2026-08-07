-- ============================================================================
-- Two independent changes, applied together (2026-08-07) as part of reviving
-- the Objekt feature:
--
-- 1. property_objects.type: enum -> free text.
--    The original 8 types (hiss/vind/miljörum/källare/SBA/tvätt/förråd/lokal)
--    were a Postgres enum (object_type). Client decision: an objekt's type is
--    admin-written free text, same combobox pattern as apartments.status
--    (EditableSelect — see src/components/EditableSelect.tsx and
--    APARTMENT_STATUSES) — pick a suggested value or type a new one, and it
--    becomes a future suggestion. An enum cannot grow from client input
--    (ALTER TYPE ... ADD VALUE is a manual, non-transactional DDL step), so it
--    is converted to plain text. objectTypeLabel() in src/lib/object-tokens.ts
--    already tolerates arbitrary values (falls back to the raw string), and
--    already lowercases before matching the 8 known codes, so existing rows
--    render unchanged regardless of new free-text casing.
--
-- 2. projects.property_object_id — mirrors issues.property_object_id /
--    inspections.property_object_id byte-for-byte (ON DELETE SET NULL: a
--    projekt describing an objekt is still a real record once the objekt is
--    gone, same reasoning as admin-delete.sql's set_null exceptions).
--    An objekt can now have a besiktning, felanmälan, AND projekt raised
--    against it; assigning an entreprenör to any of the three (via the
--    ärendets own AnsvarigDropdown, same two-step pattern documented in
--    property-objects-scoped-rls.sql) qualifies them under
--    has_object_assignment(), which now checks all three tables.
--
-- Applied directly to the live DB via Supabase MCP on 2026-08-07. Reference
-- copy, same convention as the rest of supabase-functions/. Safe to re-run
-- (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION); the type conversion
-- is idempotent since re-running `text -> text USING type::text` is a no-op.
--
-- IMPORTANT: admin-delete.sql's foreign-key sweep (step 2) has a `set_null`
-- exception list keyed by "table.column" — 'projects.property_object_id' was
-- added there too. If admin-delete.sql is ever re-run WITHOUT that entry, its
-- generic sweep will silently flip this column from SET NULL to CASCADE
-- (deleting a projekt's objekt would then delete the projekt). Keep the two
-- files in agreement.
-- ============================================================================

ALTER TABLE public.property_objects ALTER COLUMN type TYPE text USING type::text;
DROP TYPE IF EXISTS public.object_type;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS property_object_id uuid
    REFERENCES public.property_objects(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.has_object_assignment(p_object_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_object_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.profile_id = auth.uid()
      AND (
        EXISTS (SELECT 1 FROM issues i
                 WHERE i.property_object_id = p_object_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n
                 WHERE n.property_object_id = p_object_id AND n.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM projects p
                 WHERE p.property_object_id = p_object_id AND p.assigned_contact_id = c.id)
      )
  );
$function$;
