-- Synpunkter och klagomål från medlemmar (t.ex. om avgiftshöjningen)
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Kräver is_admin(), is_styrelse() och my_property_ids() (finns sedan tidigare).
--
-- member_feedback: den som fyller i den publika sidan /lamna-synpunkt. Skrivs av edge-funktionen
-- submit-synpunkt (service role) — ingen klientskrivning av nya rader. Styrelsen läser och
-- markerar i plattformen (/synpunkter) och svarar via sin egen e-post.
--
-- status: ny (ej läst) · last (läst) · besvarad.
-- Läsning och ändring: admin allt, styrelse sin egen förening, medarbetare allt (om rollen finns).
-- Radera: bara admin.
-- ---------------------------------------------------------------------------

create sequence if not exists public.member_feedback_seq;

create table if not exists public.member_feedback (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique
                   default ('SY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.member_feedback_seq')::text, 4, '0')),
  property_id      uuid not null references public.properties(id) on delete cascade,
  topic            text not null default 'avgiftshojning',
  category         text not null default 'synpunkt' check (category in ('synpunkt', 'fraga', 'klagomal')),
  apartment_number text not null,
  trappa           text not null,
  name             text not null,
  email            text not null,
  message          text not null,
  status           text not null default 'ny' check (status in ('ny', 'last', 'besvarad')),
  staff_note       text,
  handled_by       uuid,
  handled_by_name  text,
  handled_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists member_feedback_idx on public.member_feedback (property_id, status, created_at);

alter table public.member_feedback enable row level security;

drop policy if exists member_feedback_select on public.member_feedback;
create policy member_feedback_select on public.member_feedback for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists member_feedback_staff_update on public.member_feedback;
create policy member_feedback_staff_update on public.member_feedback for update to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())))
  with check ((select public.is_admin())
              or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists member_feedback_admin_delete on public.member_feedback;
create policy member_feedback_admin_delete on public.member_feedback for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.member_feedback from anon;
grant select, update, delete on public.member_feedback to authenticated;

-- Medarbetare (om rollen är inlagd via medarbetare-roll.sql): läsa och ändra, aldrig radera.
do $$
begin
  if to_regprocedure('public.is_medarbetare()') is not null then
    execute 'drop policy if exists medarbetare_select on public.member_feedback';
    execute 'create policy medarbetare_select on public.member_feedback for select to authenticated using (public.is_medarbetare())';
    execute 'drop policy if exists medarbetare_update on public.member_feedback';
    execute 'create policy medarbetare_update on public.member_feedback for update to authenticated using (public.is_medarbetare()) with check (public.is_medarbetare())';
  end if;
end $$;

-- Realtime för klockan (valfritt; utan den tar 60 s-intervallet och fönsterfokus över).
do $$
begin
  alter publication supabase_realtime add table public.member_feedback;
exception when duplicate_object then null;
         when undefined_object then null;
end $$;
