-- Anteckningar på en lägenhet: styrelsen (read-only i övrigt) kan lämna ett önskemål/en notering
-- till förvaltaren, admin ser dem, markerar dem som klara och kan radera. Körs för hand. Säker att köra om.
-- Kräver is_admin(), is_styrelse() och my_property_ids() (finns sedan tidigare).

create table if not exists public.apartment_notes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  done boolean not null default false,
  done_at timestamptz
);
create index if not exists apartment_notes_apartment_idx on public.apartment_notes (apartment_id, created_at desc);

alter table public.apartment_notes enable row level security;

drop policy if exists apartment_notes_select on public.apartment_notes;
create policy apartment_notes_select on public.apartment_notes for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

-- Styrelse får lägga till i sin egen förening, och bara som sig själv.
drop policy if exists apartment_notes_insert on public.apartment_notes;
create policy apartment_notes_insert on public.apartment_notes for insert to authenticated
  with check (created_by = auth.uid()
              and ((select public.is_admin())
                   or (public.is_styrelse() and property_id in (select public.my_property_ids()))));

drop policy if exists apartment_notes_admin_update on public.apartment_notes;
create policy apartment_notes_admin_update on public.apartment_notes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists apartment_notes_admin_delete on public.apartment_notes;
create policy apartment_notes_admin_delete on public.apartment_notes for delete to authenticated
  using ((select public.is_admin()));
