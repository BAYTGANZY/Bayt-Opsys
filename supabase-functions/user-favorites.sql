-- Favoriter i menyn (stjärnor)
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Varje inloggad användare sparar sina egna favoritsidor (route, t.ex. '/dag-rapport').
-- Ingen kan se eller ändra någon annans favoriter. Gäller alla roller; vilka sidor
-- som visas styrs fortfarande av behörigheterna i appen.
-- Utan den här tabellen fungerar favoriter ändå, men bara i den webbläsare där
-- stjärnan trycktes (sparas lokalt).
-- ---------------------------------------------------------------------------

create table if not exists public.user_favorites (
  profile_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  route      text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, route)
);

alter table public.user_favorites enable row level security;

drop policy if exists user_favorites_select on public.user_favorites;
create policy user_favorites_select on public.user_favorites for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists user_favorites_insert on public.user_favorites;
create policy user_favorites_insert on public.user_favorites for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists user_favorites_delete on public.user_favorites;
create policy user_favorites_delete on public.user_favorites for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.user_favorites from anon;
grant select, insert, delete on public.user_favorites to authenticated;
