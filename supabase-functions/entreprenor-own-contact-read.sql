-- ============================================================================
-- contacts RLS had SELECT policies for admin (all rows) and styrelse (their
-- properties), but none at all for entreprenor -- not even their own row.
--
-- useMyContactId.ts (src/hooks/useMyContactId.ts) does a direct client-side
-- `.from("contacts").select("id").eq("profile_id", user.id)` as its primary
-- path, with the ensure_my_contact_link() RPC as a fallback for a genuinely
-- missing link (see that file's comments). With no policy at all, the direct
-- read always returned zero rows for every entreprenor, so every call fell
-- through to the RPC fallback path unconditionally instead of only when the
-- link was actually missing. account-continuity.sql's self-healing masked
-- the effect (still resolves the right contact id, just via an extra
-- round-trip every time), but it's not the path the code intended.
--
-- Applied directly to the live DB via Supabase MCP on 2026-07-30
-- (migration: add_entreprenor_own_contact_read_policy). Reference copy, same
-- convention as the rest of supabase-functions/. Safe to re-run.
-- ============================================================================

drop policy if exists "entreprenor_read_own_contact" on public.contacts;
create policy "entreprenor_read_own_contact" on public.contacts
  for select to authenticated
  using (profile_id = auth.uid());
