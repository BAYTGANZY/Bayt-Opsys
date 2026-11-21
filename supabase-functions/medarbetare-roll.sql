-- Rollen MEDARBETARE (anställd) — kan se och ändra, aldrig radera, ingen ekonomi, ingen användarhantering.
-- Körs för hand i Supabase → SQL Editor, i TVÅ steg (kör varje block för sig, i ordning).
-- Båda stegen går bra att köra om. Inget befintligt tas bort eller ändras: admin, styrelse och
-- entreprenör påverkas inte, eftersom allt här är NYA policyer som bara gäller medarbetare.
--
-- ===================== STEG 1 — kör bara de här raderna först =====================
alter type public.user_role add value if not exists 'medarbetare';
-- ==================================================================================


-- ===================== STEG 2 — kör resten (allt nedanför) ========================

-- Hjälpfunktion. SECURITY DEFINER så att den kan läsa profiles inifrån en policy på profiles
-- utan att Postgres klagar på rekursion (42P17), samma mönster som övriga hjälpfunktioner.
create or replace function public.is_medarbetare()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'medarbetare'
  );
$$;
revoke all on function public.is_medarbetare() from public, anon;
grant execute on function public.is_medarbetare() to authenticated;

-- Policyer: SELECT / INSERT / UPDATE enligt listan. ALDRIG DELETE — det är hela poängen, och det
-- gäller i databasen, inte bara i knapparna. Läggs bara på tabeller som finns OCH redan har
-- radnivåskydd påslaget (att slå på det här hade stängt ute alla andra roller).
do $$
declare
  r record;
  op text;
  cond text := 'public.is_medarbetare()';
begin
  for r in
    select * from (values
      -- tabell,                  operationer
      ('issues',                  'select,insert,update'),
      ('inspections',             'select,insert,update'),
      ('projects',                'select,insert,update'),
      ('apartments',              'select,insert,update'),
      ('properties',              'select,update'),
      ('contacts',                'select,insert,update'),
      ('property_objects',        'select,insert,update'),
      ('logbook_entries',         'select,insert'),
      ('logbook_comments',        'select,insert'),
      ('documents',               'select,insert,update'),
      ('property_documents',      'select,insert'),
      ('doc_folders',             'select,insert'),
      ('doc_files',               'select,insert'),
      ('issue_images',            'select,insert'),
      ('project_images',          'select,insert'),
      ('issue_comments',          'select,insert'),
      ('issue_status_history',    'select,insert'),
      ('inspection_protocols',    'select,insert'),
      ('protocols',               'select,insert'),
      ('contractor_files',        'select,insert'),
      ('actions',                 'select,insert,update'),
      ('maintenance_plans',       'select,insert,update'),
      ('maintenance_actions',     'select,insert,update'),
      ('maintenance_images',      'select,insert'),
      ('maintenance_comments',    'select,insert'),
      ('maintenance_plan_access', 'select'),
      ('parking_queue',           'select,insert,update'),
      ('sublettings',             'select,insert,update'),
      ('sublet_documents',        'select,insert,update'),
      ('sublet_applications',     'select'),
      ('sublet_application_files','select'),
      ('laundry_code_requests',   'select,update'),
      ('apartment_notes',         'select,update'),
      ('property_walkthroughs',   'select,insert,update'),
      ('teknik_rounds',           'select,insert,update'),
      ('teknik_items',            'select,insert,update'),
      ('teknik_checks',           'select,insert,update'),
      ('presentation_tiles',      'select,insert,update'),
      ('property_presentation',   'select,insert,update'),
      ('forvaltning_links',       'select'),
      ('property_letterhead',     'select,insert,update'),
      ('project_update_notifications', 'select,insert'),
      ('arende_notifications',    'select,insert'),
      ('audit_events',            'select'),
      ('profiles',                'select')
    ) as t(tbl, ops)
  loop
    if to_regclass('public.' || r.tbl) is null then continue; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || r.tbl)::regclass) then continue; end if;

    foreach op in array string_to_array(r.ops, ',') loop
      execute format('drop policy if exists %I on public.%I', 'medarbetare_' || op, r.tbl);
      if op = 'select' then
        execute format('create policy %I on public.%I for select to authenticated using (%s)', 'medarbetare_' || op, r.tbl, cond);
      elsif op = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', 'medarbetare_' || op, r.tbl, cond);
      elsif op = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', 'medarbetare_' || op, r.tbl, cond, cond);
      end if;
    end loop;
  end loop;
end $$;

-- Filer: ladda upp och läsa i de vanliga hinkarna, men inte radera.
do $$
declare b text; op text;
begin
  foreach b in array array['documents','project-files','protocols','contractor-files','property-images','avatars'] loop
    execute format('drop policy if exists %I on storage.objects', 'medarbetare_select_' || b);
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.is_medarbetare())', 'medarbetare_select_' || b, b);
    execute format('drop policy if exists %I on storage.objects', 'medarbetare_insert_' || b);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.is_medarbetare())', 'medarbetare_insert_' || b, b);
  end loop;
end $$;

-- ===================== Kontroll (läser bara) =====================
-- Ska visa en rad per tabell, med bara select/insert/update — aldrig delete.
select tablename, string_agg(cmd, ', ' order by cmd) as medarbetare_far
from pg_policies
where policyname like 'medarbetare\_%'
group by tablename
order by tablename;
