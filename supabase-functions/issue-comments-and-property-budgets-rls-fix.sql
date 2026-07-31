-- ============================================================================
-- Found by comparing live RLS against actual frontend usage (2026-07-30).
--
-- Bug 1: issue_comments' "Contractor can read and add comments on assigned
-- issues" policy checked issues.assigned_to = auth.uid() -- the legacy
-- profiles-based assignment column CLAUDE.md documents as superseded by the
-- contacts-based assigned_contact_id system (see the "Ansvarig" section).
-- No current write path ever sets assigned_to for an entreprenor, so this
-- policy was permanently false for every real assignment. Verified live: an
-- entreprenor's insert on their own assigned issue's comment thread
-- (src/routes/_authenticated.issues.$id.tsx, an active, rendered feature)
-- failed with 42501 before this fix, succeeded after. issue_images and
-- project_images already used the correct assigned_contact_id =
-- my_contact_id() pattern -- this brings issue_comments in line with them.
--
-- Bug 2: property_budgets' "Styrelse read own budget" policy had a
-- self-comparison tautology (property_budgets.property_id =
-- property_budgets.property_id, always true) instead of scoping to the
-- styrelse's attached buildings via styrelse_properties. Any styrelse
-- account could read every building's budget. /ekonomi isn't in a
-- styrelse's canAccess allowlist (src/lib/permissions.ts) so this wasn't
-- reachable through normal navigation, but per this app's own stated
-- principle ("UI filtering is not a boundary"), the RLS itself must be
-- correct regardless. Verified live with a planted foreign building's
-- budget: styrelse saw only their own building's total after the fix.
--
-- Applied directly to the live DB via Supabase MCP on 2026-07-30
-- (migration: fix_issue_comments_and_property_budgets_rls). Reference copy,
-- same convention as the rest of supabase-functions/. Safe to re-run.
-- ============================================================================

drop policy if exists "Contractor can read and add comments on assigned issues" on public.issue_comments;
create policy "Contractor can read and add comments on assigned issues" on public.issue_comments
  for all to authenticated
  using (is_contractor() and exists (
    select 1 from issues i where i.id = issue_comments.issue_id and i.assigned_contact_id = my_contact_id()
  ))
  with check (is_contractor() and exists (
    select 1 from issues i where i.id = issue_comments.issue_id and i.assigned_contact_id = my_contact_id()
  ));

drop policy if exists "Styrelse read own budget" on public.property_budgets;
create policy "Styrelse read own budget" on public.property_budgets
  for select to public
  using (is_styrelse() and property_id in (select my_property_ids()));
