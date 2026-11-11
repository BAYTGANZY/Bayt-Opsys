-- Ekonomi – budgetuppföljning (/ekonomi-budget)
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Kräver att ekonomi-oversikt.sql redan är körd (samma hjälpfunktioner).
--
-- Budgeten läses ur SIE-filen (#PBUDGET) i samma inläsning som utfallet och
-- sparas per fastighet / år / månad / konto, med samma tecken som i SIE:
-- intäkter minus, kostnader plus.
--
-- Läsning: admin allt, styrelse bara sin egen förening. Skrivning: bara admin.
-- Entreprenör och anonyma har ingen åtkomst.
-- ---------------------------------------------------------------------------

create table if not exists public.finance_budgets (
  property_id uuid not null references public.properties(id) on delete cascade,
  year        integer not null,
  month       integer not null check (month between 1 and 12),
  account     text not null,
  amount      numeric(16,2) not null,
  primary key (property_id, year, month, account)
);

create index if not exists finance_budgets_property_year_idx
  on public.finance_budgets (property_id, year);

alter table public.finance_budgets enable row level security;

drop policy if exists finance_budgets_select on public.finance_budgets;
create policy finance_budgets_select on public.finance_budgets for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists finance_budgets_admin_write on public.finance_budgets;
create policy finance_budgets_admin_write on public.finance_budgets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.finance_budgets from anon;
grant select, insert, update, delete on public.finance_budgets to authenticated;

-- Kontroll (ska ge en rad med relrowsecurity = true):
-- select relname, relrowsecurity from pg_class where relname = 'finance_budgets';
