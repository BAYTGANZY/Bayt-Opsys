-- ============================================================================
-- property_objects previously had blanket "any authenticated user, any
-- building" read/write (see logbook-comments-property-objects-delete-fix.sql
-- for the earlier delete-bypass fix on the same table). Product decision
-- (2026-07-30): an object (hiss/vind/miljörum/källare/SBA/tvätt/förråd/lokal)
-- works like an apartment — attached to and owned by the building (can't be
-- rented out), can have felanmälningar and besiktningar raised against it via
-- issues.property_object_id / inspections.property_object_id, and those can
-- be assigned to an entreprenör. Access now mirrors apartments exactly:
--   - admin: full access (read/write/create)
--   - styrelse: read-only, their own buildings only
--   - entreprenör: read + status update, ONLY for an object they're actually
--     assigned to via one of its issues/inspections (assigned_contact_id) —
--     not just "somewhere in a building they work in". Exactly how
--     has_apartment_assignment works for apartments.
--   - create (INSERT): admin only, matches how apartments/properties are
--     created as structural inventory
--
-- has_object_assignment() mirrors has_apartment_assignment() byte-for-byte in
-- style (see audit-events.sql / entreprenor-read-scope.sql for that
-- byte-identical-copy convention), swapping apartment_id for
-- property_object_id.
--
-- UPDATE 2026-07-31: the gap noted above at migration time is closed. The
-- object detail page (_authenticated.properties.$id.objects.$objectId.tsx)
-- now has "Ny felanmälan"/"Ny besiktning" forms that set property_object_id
-- on insert; assigned_contact_id is then set on the issue's/inspection's own
-- detail page via <AnsvarigDropdown>, same two-step pattern apartment ärenden
-- use. Verified live 2026-08-07: RLS policies and has_object_assignment()
-- match this file exactly, and neither save payload touches
-- property_object_id, so assigning an ansvarig can't clobber the link. The
-- entreprenör path is reachable end-to-end.
--
-- Applied directly to the live DB via Supabase MCP on 2026-07-30
-- (migration: property_objects_scoped_rls). Reference copy, same convention
-- as the rest of supabase-functions/. Safe to re-run.
-- ============================================================================

create or replace function public.has_object_assignment(p_object_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT p_object_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.profile_id = auth.uid()
      AND (
        EXISTS (SELECT 1 FROM issues i
                 WHERE i.property_object_id = p_object_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n
                 WHERE n.property_object_id = p_object_id AND n.assigned_contact_id = c.id)
      )
  );
$function$;

drop policy if exists "auth read objects" on public.property_objects;
drop policy if exists "auth insert objects" on public.property_objects;
drop policy if exists "auth update objects" on public.property_objects;

create policy "admin_all" on public.property_objects
  for all to authenticated
  using (my_role() = 'admin')
  with check (my_role() = 'admin');

create policy "styrelse_read" on public.property_objects
  for select to authenticated
  using (my_role() = 'styrelse' and property_id in (select my_property_ids()));

create policy "entreprenor_read" on public.property_objects
  for select to authenticated
  using (my_role() = 'entreprenor' and has_object_assignment(id));

create policy "entreprenor_update" on public.property_objects
  for update to authenticated
  using (my_role() = 'entreprenor' and has_object_assignment(id));
