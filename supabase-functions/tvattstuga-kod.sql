-- Förfrågningar om kod till tvättstugan (Bokatvättid)
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Kräver is_admin(), is_styrelse() och my_property_ids() (finns sedan tidigare).
--
-- laundry_code_requests: den som fyller i den publika sidan /tvattstuga-kod.
-- Skrivs av edge-funktionen submit-tvattstuga (service role). Pinkoden sparas
-- ALDRIG här: styrelsen slår upp den i Bokatvättid, skriver in den i listan och
-- funktionen mejlar den vidare. Den finns alltså bara i mejlet.
--
-- status: ny (väntar på kod) · skickad (koden mejlad) · fastnat (mejlet gick
-- inte iväg, styrelsen måste skicka själv) · avvisad.
-- Läsning och ändring: admin allt, styrelse sin egen förening. Radera: admin.
-- ---------------------------------------------------------------------------

create sequence if not exists public.laundry_code_requests_seq;

create table if not exists public.laundry_code_requests (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique
                   default ('TK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.laundry_code_requests_seq')::text, 4, '0')),
  property_id      uuid not null references public.properties(id) on delete cascade,
  apartment_number text not null,
  trappa           text not null,
  name             text not null,
  email            text not null,
  phone            text,
  status           text not null default 'ny' check (status in ('ny', 'skickad', 'fastnat', 'avvisad')),
  send_error       text,                         -- varför utskicket fastnade
  sent_at          timestamptz,
  sent_by          uuid,                         -- profil som tryckte "Skicka koden"
  sent_by_name     text,
  staff_note       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists laundry_code_requests_idx on public.laundry_code_requests (property_id, status, created_at);

alter table public.laundry_code_requests enable row level security;

drop policy if exists laundry_code_requests_select on public.laundry_code_requests;
create policy laundry_code_requests_select on public.laundry_code_requests for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists laundry_code_requests_staff_update on public.laundry_code_requests;
create policy laundry_code_requests_staff_update on public.laundry_code_requests for update to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())))
  with check ((select public.is_admin())
              or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists laundry_code_requests_admin_delete on public.laundry_code_requests;
create policy laundry_code_requests_admin_delete on public.laundry_code_requests for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.laundry_code_requests from anon;
grant select, update, delete on public.laundry_code_requests to authenticated;

-- Realtime för klockan (valfritt; utan den tar 60 s-intervallet och fönsterfokus över).
do $$
begin
  alter publication supabase_realtime add table public.laundry_code_requests;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;
