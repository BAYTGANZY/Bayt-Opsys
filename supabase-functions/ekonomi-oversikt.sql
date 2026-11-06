-- Ekonomi – översikt (/ekonomi-oversikt)
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
--
-- Vad som sparas: bara kontosummor per månad ur en SIE-fil från bokföringen.
-- Inga verifikationer, inga leverantörs- eller personuppgifter.
--
--   finance_accounts  konto → namn, per fastighet (namnet står i SIE-filen)
--   finance_balances  belopp per fastighet / år / månad / konto
--                       month = 0     ingående balans för året (bara konto 1xxx-2xxx)
--                       month = 1..12 förändring under månaden (SIE #PSALDO)
--                       Intäkter har minustecken, kostnader plustecken (som i SIE).
--   finance_imports   logg: vem importerade vilken fil och när
--
-- Läsning: admin allt, styrelse bara sin egen förening. Skrivning: bara admin.
-- Entreprenör och anonyma har ingen åtkomst alls.
-- ---------------------------------------------------------------------------

create table if not exists public.finance_accounts (
  property_id uuid not null references public.properties(id) on delete cascade,
  account     text not null,
  name        text not null,
  primary key (property_id, account)
);

create table if not exists public.finance_balances (
  property_id uuid not null references public.properties(id) on delete cascade,
  year        integer not null,
  month       integer not null check (month between 0 and 12),
  account     text not null,
  amount      numeric(16,2) not null,
  primary key (property_id, year, month, account)
);

create index if not exists finance_balances_property_year_idx
  on public.finance_balances (property_id, year);

create table if not exists public.finance_imports (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  imported_by   uuid references auth.users(id) on delete set null,
  file_name     text,
  source_name   text,        -- #FNAMN i filen
  source_orgnr  text,        -- #ORGNR i filen
  years         integer[],
  latest_period text,        -- senaste månad med utfall, t.ex. '202610'
  account_count integer,
  row_count     integer,
  created_at    timestamptz not null default now()
);

create index if not exists finance_imports_property_idx
  on public.finance_imports (property_id, created_at desc);

alter table public.finance_accounts enable row level security;
alter table public.finance_balances enable row level security;
alter table public.finance_imports  enable row level security;

-- Läs: admin allt, styrelse sin egen förening.
drop policy if exists finance_accounts_select on public.finance_accounts;
create policy finance_accounts_select on public.finance_accounts for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists finance_balances_select on public.finance_balances;
create policy finance_balances_select on public.finance_balances for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists finance_imports_select on public.finance_imports;
create policy finance_imports_select on public.finance_imports for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

-- Skriv: bara admin.
drop policy if exists finance_accounts_admin_write on public.finance_accounts;
create policy finance_accounts_admin_write on public.finance_accounts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists finance_balances_admin_write on public.finance_balances;
create policy finance_balances_admin_write on public.finance_balances for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists finance_imports_admin_write on public.finance_imports;
create policy finance_imports_admin_write on public.finance_imports for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.finance_accounts, public.finance_balances, public.finance_imports from anon;
grant select, insert, update, delete on public.finance_accounts, public.finance_balances, public.finance_imports to authenticated;

-- Kontroll (ska ge tre rader med relrowsecurity = true):
-- select relname, relrowsecurity from pg_class
--  where relname in ('finance_accounts','finance_balances','finance_imports');
