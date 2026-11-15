-- Kölista för parkeringsplatser
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Kräver is_admin(), is_styrelse() och my_property_ids() (finns sedan tidigare).
--
-- parking_queue: den som ställer sig i kö på den publika sidan /parkering-ko.
-- Skrivs av edge-funktionen submit-parkering (service role). Köplatsen är
-- queued_at: den som ställde sig först står först, per förening och typ.
-- Läsning: admin allt, styrelse sin egen förening. Styrelsen får även lägga in
-- och ändra (ex. någon som ringt) men aldrig radera.
-- ---------------------------------------------------------------------------

create sequence if not exists public.parking_queue_seq;

create table if not exists public.parking_queue (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique
                   default ('PK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.parking_queue_seq')::text, 4, '0')),
  property_id      uuid not null references public.properties(id) on delete cascade,
  kind             text not null default 'parkering' check (kind in ('parkering', 'garage')),
  apartment_number text not null,
  trappa           text,
  name             text not null,
  email            text not null,
  phone            text,
  vehicle_reg      text,
  note             text,
  status           text not null default 'vantar'
                   check (status in ('vantar', 'erbjuden', 'tilldelad', 'struken')),
  staff_note       text,
  spot_label       text,                         -- vilken plats som erbjudits/tilldelats
  source           text not null default 'webb' check (source in ('webb', 'styrelse')),
  handled_by_name  text,
  handled_at       timestamptz,
  token            uuid not null default gen_random_uuid(),   -- personlig länk för att följa/lämna kön
  queued_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists parking_queue_idx on public.parking_queue (property_id, kind, status, queued_at);
-- En person kan bara stå en gång per förening och typ så länge hen är aktiv i kön.
create unique index if not exists parking_queue_one_active_uidx
  on public.parking_queue (property_id, kind, lower(email))
  where status in ('vantar', 'erbjuden');

alter table public.parking_queue enable row level security;

drop policy if exists parking_queue_select on public.parking_queue;
create policy parking_queue_select on public.parking_queue for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists parking_queue_staff_insert on public.parking_queue;
create policy parking_queue_staff_insert on public.parking_queue for insert to authenticated
  with check ((select public.is_admin())
              or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists parking_queue_staff_update on public.parking_queue;
create policy parking_queue_staff_update on public.parking_queue for update to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())))
  with check ((select public.is_admin())
              or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists parking_queue_admin_delete on public.parking_queue;
create policy parking_queue_admin_delete on public.parking_queue for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.parking_queue from anon;
grant select, insert, update, delete on public.parking_queue to authenticated;
