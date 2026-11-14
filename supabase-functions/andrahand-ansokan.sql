-- Andrahandsuthyrning: ansökan från medlem + styrelsens åtkomst
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Kräver att is_admin(), is_styrelse() och my_property_ids() finns (de gör det,
-- ekonomi-oversikt.sql använder dem redan).
--
-- 1. sublet_applications / sublet_application_files — ansökningar från den publika
--    sidan /ansok-andrahand. Skrivs bara av edge-funktionerna submit-andrahand och
--    decide-andrahand (service role). Läsning: admin allt, styrelse sin egen förening.
-- 2. Privat lagring `sublet-applications` för bilagorna.
-- 3. Styrelsen får läsa/skapa/ändra i det befintliga andrahandsregistret
--    (sublettings, sublet_documents, bucket sublet-docs) för sin egen förening.
--    Ingen radering — det är fortfarande bara admin.
-- ---------------------------------------------------------------------------

create sequence if not exists public.sublet_application_seq;

create table if not exists public.sublet_applications (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique
                   default ('AH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.sublet_application_seq')::text, 4, '0')),
  property_id      uuid not null references public.properties(id) on delete cascade,
  apartment_number text not null,
  trappa           text,
  applicant_name   text not null,
  applicant_email  text not null,
  applicant_phone  text,
  tenant_name      text not null,
  tenant_contact   text,
  start_date       date not null,
  end_date         date not null,
  reason           text not null,
  reason_text      text,
  status           text not null default 'ny'
                   check (status in ('ny', 'komplettering', 'godkand', 'nekad')),
  decision_note    text,
  decided_by       uuid references auth.users(id) on delete set null,
  decided_by_name  text,
  decided_at       timestamptz,
  token            uuid not null default gen_random_uuid(),   -- länk för komplettering
  supplement_note  text,                                      -- sökandens kommentar vid komplettering
  sublet_id        text,                                      -- raden i sublettings som skapades vid godkännande
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Fanns tabellen redan från en tidigare körning:
alter table public.sublet_applications add column if not exists supplement_note text;

create index if not exists sublet_applications_property_idx
  on public.sublet_applications (property_id, status, created_at desc);

create table if not exists public.sublet_application_files (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sublet_applications(id) on delete cascade,
  file_path      text not null,
  file_name      text not null,
  file_size      integer,
  added_by       text not null default 'sokande',   -- 'sokande' | 'styrelse'
  created_at     timestamptz not null default now()
);

create index if not exists sublet_application_files_app_idx
  on public.sublet_application_files (application_id);

alter table public.sublet_applications enable row level security;
alter table public.sublet_application_files enable row level security;

drop policy if exists sublet_applications_select on public.sublet_applications;
create policy sublet_applications_select on public.sublet_applications for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists sublet_applications_admin_write on public.sublet_applications;
create policy sublet_applications_admin_write on public.sublet_applications for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists sublet_application_files_select on public.sublet_application_files;
create policy sublet_application_files_select on public.sublet_application_files for select to authenticated
  using (exists (
    select 1 from public.sublet_applications a
    where a.id = application_id
      and ((select public.is_admin())
           or (public.is_styrelse() and a.property_id in (select public.my_property_ids())))
  ));

drop policy if exists sublet_application_files_admin_write on public.sublet_application_files;
create policy sublet_application_files_admin_write on public.sublet_application_files for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.sublet_applications from anon;
revoke all on public.sublet_application_files from anon;
grant select on public.sublet_applications to authenticated;
grant select on public.sublet_application_files to authenticated;

-- 2. Privat bucket för ansökningsbilagor -------------------------------------
insert into storage.buckets (id, name, public)
values ('sublet-applications', 'sublet-applications', false)
on conflict (id) do update set public = false;

drop policy if exists sublet_applications_files_read on storage.objects;
create policy sublet_applications_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'sublet-applications'
    and exists (
      select 1
      from public.sublet_application_files f
      join public.sublet_applications a on a.id = f.application_id
      where f.file_path = storage.objects.name
        and ((select public.is_admin())
             or (public.is_styrelse() and a.property_id in (select public.my_property_ids())))
    )
  );

-- 3. Styrelsen i det befintliga registret ------------------------------------
-- Policys läggs bara till där RLS redan är på: att slå på RLS på en tabell som
-- idag skyddas av behörigheter ensamt skulle stänga ute alla andra.
do $$
declare
  t text;
begin
  foreach t in array array['sublettings', 'sublet_documents'] loop
    if to_regclass('public.' || t) is not null
       and (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      execute format('drop policy if exists %I on public.%I', t || '_styrelse_select', t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_styrelse() and property_id in (select public.my_property_ids()))',
        t || '_styrelse_select', t);
      execute format('drop policy if exists %I on public.%I', t || '_styrelse_insert', t);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.is_styrelse() and property_id in (select public.my_property_ids()))',
        t || '_styrelse_insert', t);
      execute format('drop policy if exists %I on public.%I', t || '_styrelse_update', t);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.is_styrelse() and property_id in (select public.my_property_ids())) with check (public.is_styrelse() and property_id in (select public.my_property_ids()))',
        t || '_styrelse_update', t);
    end if;
  end loop;
end $$;

-- Bilagor till registret: sökvägen är <property_id>/<uthyrning>/<fil>.
drop policy if exists sublet_docs_styrelse_read on storage.objects;
create policy sublet_docs_styrelse_read on storage.objects for select to authenticated
  using (bucket_id = 'sublet-docs' and public.is_styrelse()
         and (storage.foldername(name))[1]::text in (select public.my_property_ids()::text));

drop policy if exists sublet_docs_styrelse_insert on storage.objects;
create policy sublet_docs_styrelse_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sublet-docs' and public.is_styrelse()
              and (storage.foldername(name))[1]::text in (select public.my_property_ids()::text));

-- Kontroll (ska ge true på båda raderna):
-- select relname, relrowsecurity from pg_class where relname in ('sublet_applications', 'sublet_application_files');
