-- ============================================================================
-- Fix: blanket ALL policies on logbook_comments and property_objects let any
-- authenticated user (admin, styrelse, entreprenor) delete any row, silently
-- overriding the existing *_delete_admin (is_admin()) policies on both
-- tables -- Postgres RLS permissive policies OR together. This contradicted
-- the documented "Radering (admin)" contract in CLAUDE.md: "Admin-only
-- everywhere... every DELETE policy is gated on is_admin()".
--
-- Applied directly to the live DB via Supabase MCP on 2026-07-30
-- (migration: fix_logbook_comments_property_objects_delete_bypass). This file
-- is the reference copy, same convention as the rest of supabase-functions/.
-- Safe to re-run (drop if exists + recreate).
--
-- No behavior change for read/insert/update: both tables had no client-side
-- role gate on those paths, so SELECT/INSERT/UPDATE stay open to any
-- authenticated user exactly as before. Only DELETE narrows to admin-only,
-- which is what the app's UI already assumed.
-- ============================================================================

drop policy if exists "auth full access logcomments" on public.logbook_comments;
create policy "auth read logcomments" on public.logbook_comments for select to authenticated using (true);
create policy "auth insert logcomments" on public.logbook_comments for insert to authenticated with check (true);
create policy "auth update logcomments" on public.logbook_comments for update to authenticated using (true) with check (true);

drop policy if exists "auth full access objects" on public.property_objects;
create policy "auth read objects" on public.property_objects for select to authenticated using (true);
create policy "auth insert objects" on public.property_objects for insert to authenticated with check (true);
create policy "auth update objects" on public.property_objects for update to authenticated using (true) with check (true);
