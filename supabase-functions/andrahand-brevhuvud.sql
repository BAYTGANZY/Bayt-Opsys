-- Brevhuvud för utskrifter (logga + kontaktuppgifter per förening)
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
create table if not exists public.property_letterhead (
  property_id uuid primary key references public.properties(id) on delete cascade,
  org_name    text,
  org_number  text,
  address     text,
  email       text,
  phone       text,
  website     text,
  logo_data   text,            -- liten bild som data-URL (förminskas i webbläsaren)
  updated_at  timestamptz not null default now()
);

alter table public.property_letterhead enable row level security;

drop policy if exists property_letterhead_select on public.property_letterhead;
create policy property_letterhead_select on public.property_letterhead for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists property_letterhead_insert on public.property_letterhead;
create policy property_letterhead_insert on public.property_letterhead for insert to authenticated
  with check ((select public.is_admin())
              or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists property_letterhead_update on public.property_letterhead;
create policy property_letterhead_update on public.property_letterhead for update to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())))
  with check ((select public.is_admin())
              or (public.is_styrelse() and property_id in (select public.my_property_ids())));

revoke all on public.property_letterhead from anon;
grant select, insert, update on public.property_letterhead to authenticated;
