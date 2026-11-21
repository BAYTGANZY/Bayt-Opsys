-- Kontrollera att allt är på plats (BAYT) — ändrar ingenting, bara läser.
-- Klistra in i Supabase → SQL Editor → Run. Du får en lista: rader som är SAKNAS eller
-- KONTROLLERA kommer först. Allt ska vara OK (rader märkta VALFRITT behövs bara om du använder funktionen).

with
  tabeller as (select table_name::text as k from information_schema.tables where table_schema = 'public'),
  kolumner as (select (table_name || '.' || column_name)::text as k from information_schema.columns where table_schema = 'public'),
  notnull as (select (table_name || '.' || column_name)::text as k from information_schema.columns where table_schema = 'public' and is_nullable = 'NO'),
  funktioner as (select p.proname::text as k from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
  triggers as (select tgname::text as k from pg_trigger where not tgisinternal),
  policyer as (select (tablename || '.' || policyname)::text as k from pg_policies),
  index_ as (select indexname::text as k from pg_indexes where schemaname = 'public'),
  constraints_ as (select conname::text as k from pg_constraint),
  rls as (select c.relname::text as k from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity),
  realtime as (select tablename::text as k from pg_publication_tables where pubname = 'supabase_realtime'),
  buckets as (select id::text as k from storage.buckets),

  -- (grupp, typ, namn, nivå) där nivå = 'krav' eller 'valfritt'
  forvantat(grupp, typ, namn, niva) as (values
    -- Tabeller
    ('Tabeller', 'tabell', 'profiles', 'krav'),
    ('Tabeller', 'tabell', 'properties', 'krav'),
    ('Tabeller', 'tabell', 'apartments', 'krav'),
    ('Tabeller', 'tabell', 'contacts', 'krav'),
    ('Tabeller', 'tabell', 'styrelse_properties', 'krav'),
    ('Tabeller', 'tabell', 'user_page_access', 'krav'),
    ('Tabeller', 'tabell', 'account_memory', 'krav'),
    ('Tabeller', 'tabell', 'contact_delegations', 'valfritt'),
    ('Tabeller', 'tabell', 'audit_events', 'krav'),
    ('Tabeller', 'tabell', 'entreprenor_login_codes', 'krav'),
    ('Tabeller', 'tabell', 'entreprenor_sessions', 'krav'),
    ('Tabeller', 'tabell', 'chat_conversations', 'krav'),
    ('Tabeller', 'tabell', 'chat_participants', 'krav'),
    ('Tabeller', 'tabell', 'chat_messages', 'krav'),
    ('Tabeller', 'tabell', 'apartment_notes', 'krav'),
    ('Tabeller', 'tabell', 'finance_balances', 'krav'),
    ('Tabeller', 'tabell', 'finance_budgets', 'krav'),
    ('Tabeller', 'tabell', 'sublet_applications', 'krav'),
    ('Tabeller', 'tabell', 'sublet_application_files', 'krav'),
    ('Tabeller', 'tabell', 'property_letterhead', 'krav'),
    ('Tabeller', 'tabell', 'parking_queue', 'krav'),
    ('Tabeller', 'tabell', 'laundry_code_requests', 'krav'),
    ('Tabeller', 'tabell', 'teknik_items', 'krav'),
    ('Tabeller', 'tabell', 'teknik_rounds', 'krav'),
    ('Tabeller', 'tabell', 'teknik_checks', 'krav'),
    ('Tabeller', 'tabell', 'property_walkthroughs', 'krav'),

    -- Kolumner som kommer från handkörda filer
    ('Kolumner', 'kolumn', 'contacts.active', 'krav'),
    ('Kolumner', 'kolumn', 'contacts.profile_id', 'krav'),
    ('Kolumner', 'kolumn', 'teknik_checks.action_required', 'krav'),
    ('Kolumner', 'kolumn', 'laundry_code_requests.match_result', 'krav'),
    ('Kolumner', 'kolumn', 'sublet_applications.verify_code', 'krav'),
    ('Kolumner', 'kolumn', 'sublet_applications.supplement_note', 'krav'),
    ('Kolumner', 'kolumn', 'chat_messages.deleted_at', 'krav'),
    ('Kolumner', 'kolumn', 'chat_messages.reply_to_id', 'krav'),
    ('Kolumner', 'kolumn', 'chat_messages.attachment_url', 'krav'),

    -- Lägenhetens identitet (trappa är obligatorisk)
    ('Lägenheter', 'notnull', 'apartments.trappa', 'krav'),
    ('Lägenheter', 'constraint', 'apartments_trappa_not_blank', 'krav'),
    ('Lägenheter', 'index', 'apartments_property_number_trappa_uidx', 'krav'),

    -- Funktioner (behörighet, kontokontinuitet, historik, mejl)
    ('Funktioner', 'funktion', 'is_admin', 'krav'),
    ('Funktioner', 'funktion', 'is_styrelse', 'krav'),
    ('Funktioner', 'funktion', 'my_property_ids', 'krav'),
    ('Funktioner', 'funktion', 'has_apartment_assignment', 'krav'),
    ('Funktioner', 'funktion', 'has_property_assignment', 'krav'),
    ('Funktioner', 'funktion', 'is_my_arende', 'krav'),
    ('Funktioner', 'funktion', 'my_contact_ids', 'valfritt'),
    ('Funktioner', 'funktion', 'link_or_create_contact', 'krav'),
    ('Funktioner', 'funktion', 'ensure_my_contact_link', 'krav'),
    ('Funktioner', 'funktion', 'profiles_remember_account', 'krav'),
    ('Funktioner', 'funktion', 'profiles_restore_account', 'krav'),
    ('Funktioner', 'funktion', 'lifecycle_of', 'krav'),
    ('Funktioner', 'funktion', 'audit_label', 'krav'),
    ('Funktioner', 'funktion', 'audit_events_stamp_actor', 'krav'),
    ('Funktioner', 'funktion', 'audit_log_changes', 'krav'),
    ('Funktioner', 'funktion', 'issue_progress_notify', 'krav'),
    ('Funktioner', 'funktion', 'issue_progress_step', 'krav'),
    ('Funktioner', 'funktion', 'purge_entreprenor_auth', 'krav'),
    ('Funktioner', 'funktion', 'is_chat_participant', 'krav'),
    ('Funktioner', 'funktion', 'create_chat_conversation', 'krav'),
    ('Funktioner', 'funktion', 'delete_chat_message', 'krav'),

    -- Triggers
    ('Triggers', 'trigger', 'profiles_remember_account_trg', 'krav'),
    ('Triggers', 'trigger', 'profiles_restore_account_trg', 'krav'),
    ('Triggers', 'trigger', 'profiles_restore_account_upd_trg', 'krav'),
    ('Triggers', 'trigger', 'audit_issues_trg', 'krav'),
    ('Triggers', 'trigger', 'audit_inspections_trg', 'krav'),
    ('Triggers', 'trigger', 'audit_projects_trg', 'krav'),
    ('Triggers', 'trigger', 'audit_apartments_trg', 'krav'),
    ('Triggers', 'trigger', 'audit_events_stamp_actor_trg', 'krav'),
    ('Triggers', 'trigger', 'issues_progress_notify_trigger', 'krav'),

    -- Radnivåskydd påslaget
    ('Radskydd (RLS) påslaget', 'rls', 'audit_events', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'apartment_notes', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'finance_budgets', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'sublet_applications', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'sublet_application_files', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'property_letterhead', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'parking_queue', 'krav'),
    ('Radskydd (RLS) påslaget', 'rls', 'laundry_code_requests', 'krav'),

    -- Åtkomstregler (policyer)
    ('Åtkomstregler', 'policy', 'audit_events.audit_events_select', 'krav'),
    ('Åtkomstregler', 'policy', 'apartment_notes.apartment_notes_select', 'krav'),
    ('Åtkomstregler', 'policy', 'apartment_notes.apartment_notes_insert', 'krav'),
    ('Åtkomstregler', 'policy', 'apartment_notes.apartment_notes_admin_update', 'krav'),
    ('Åtkomstregler', 'policy', 'apartment_notes.apartment_notes_admin_delete', 'krav'),
    ('Åtkomstregler', 'policy', 'finance_budgets.finance_budgets_select', 'krav'),
    ('Åtkomstregler', 'policy', 'finance_budgets.finance_budgets_admin_write', 'krav'),
    ('Åtkomstregler', 'policy', 'sublet_applications.sublet_applications_select', 'krav'),
    ('Åtkomstregler', 'policy', 'sublet_application_files.sublet_application_files_select', 'krav'),
    ('Åtkomstregler', 'policy', 'property_letterhead.property_letterhead_select', 'krav'),
    ('Åtkomstregler', 'policy', 'property_letterhead.property_letterhead_insert', 'krav'),
    ('Åtkomstregler', 'policy', 'property_letterhead.property_letterhead_update', 'krav'),
    ('Åtkomstregler', 'policy', 'parking_queue.parking_queue_select', 'krav'),
    ('Åtkomstregler', 'policy', 'parking_queue.parking_queue_staff_insert', 'krav'),
    ('Åtkomstregler', 'policy', 'parking_queue.parking_queue_staff_update', 'krav'),
    ('Åtkomstregler', 'policy', 'parking_queue.parking_queue_admin_delete', 'krav'),
    ('Åtkomstregler', 'policy', 'laundry_code_requests.laundry_code_requests_select', 'krav'),
    ('Åtkomstregler', 'policy', 'laundry_code_requests.laundry_code_requests_staff_update', 'krav'),
    ('Åtkomstregler', 'policy', 'laundry_code_requests.laundry_code_requests_admin_delete', 'krav'),
    ('Åtkomstregler', 'policy', 'properties.entreprenor_read_assigned_properties', 'krav'),
    ('Åtkomstregler', 'policy', 'apartments.entreprenor_read_assigned_apartments', 'krav'),
    ('Åtkomstregler', 'policy', 'objects.sublet_applications_files_read', 'krav'),

    -- Unika regler som skyddar mot dubbletter
    ('Unika regler', 'index', 'parking_queue_one_active_uidx', 'krav'),
    ('Unika regler', 'index', 'sublet_applications_verify_code_uidx', 'krav'),
    ('Unika regler', 'index', 'contacts_email_lower_idx', 'krav'),

    -- Realtid (klockan och notiser)
    ('Realtid (klockan)', 'realtime', 'chat_messages', 'krav'),
    ('Realtid (klockan)', 'realtime', 'sublet_applications', 'krav'),
    ('Realtid (klockan)', 'realtime', 'laundry_code_requests', 'krav'),

    -- Lagring (filer)
    ('Fillagring', 'bucket', 'sublet-applications', 'krav'),
    ('Fillagring', 'bucket', 'sublet-docs', 'krav'),
    ('Fillagring', 'bucket', 'chat-files', 'krav'),
    ('Fillagring', 'bucket', 'presentation-files', 'krav')
  ),

  forvantat_status as (
    select
      f.grupp,
      f.typ || ': ' || f.namn as kontroll,
      case
        when (case f.typ
                when 'tabell' then f.namn in (select k from tabeller)
                when 'kolumn' then f.namn in (select k from kolumner)
                when 'notnull' then f.namn in (select k from notnull)
                when 'funktion' then f.namn in (select k from funktioner)
                when 'trigger' then f.namn in (select k from triggers)
                when 'policy' then f.namn in (select k from policyer)
                when 'index' then f.namn in (select k from index_)
                when 'constraint' then f.namn in (select k from constraints_)
                when 'rls' then f.namn in (select k from rls)
                when 'realtime' then f.namn in (select k from realtime)
                when 'bucket' then f.namn in (select k from buckets)
              end) then 'OK'
        when f.niva = 'valfritt' then 'VALFRITT SAKNAS'
        else 'SAKNAS'
      end as status,
      case when f.niva = 'valfritt' then 'Behövs bara om funktionen används (t.ex. samma person med två konton).' else '' end as kommentar
    from forvantat f
  ),

  -- Sekretess: inloggningslösa (anon) ska inte kunna läsa personuppgifter
  sekretess as (
    select 'Sekretess (utloggade)' as grupp,
           'anon får inte läsa ' || t as kontroll,
           case when to_regclass('public.' || t) is null then 'SAKNAS'
                when has_table_privilege('anon', 'public.' || t, 'SELECT') then 'SAKNAS'
                else 'OK' end as status,
           case when to_regclass('public.' || t) is null then 'Tabellen finns inte.'
                when has_table_privilege('anon', 'public.' || t, 'SELECT') then 'Utloggade kan läsa tabellen. Kör REVOKE ALL ON public.' || t || ' FROM anon;'
                else '' end as kommentar
    from unnest(array['apartments', 'account_memory', 'parking_queue', 'laundry_code_requests',
                      'sublet_applications', 'sublet_application_files', 'audit_events']) as t
  ),
  sekretess_policy as (
    select 'Sekretess (utloggade)', 'ingen öppen läsregel på lägenheter',
           case when exists (select 1 from pg_policies where tablename = 'apartments' and policyname = 'Public can read apartment numbers for felanmalan form') then 'SAKNAS' else 'OK' end,
           'Den öppna regeln ska vara borttagen (annars kan vem som helst lista lägenhetsnummer).'
  ),

  -- Data: sådant som bör se rätt ut inför skarp drift
  data_kontroller as (
    select 'Data' as grupp, 'lägenheter utan trappa' as kontroll,
           case when n = 0 then 'OK' else 'KONTROLLERA' end as status,
           n || ' st (ska vara 0)' as kommentar
    from (select count(*)::int as n from public.apartments where btrim(coalesce(trappa, '')) = '') x
    union all
    select 'Data', 'admin-konton', case when n >= 1 then 'OK' else 'KONTROLLERA' end, n || ' st'
    from (select count(*)::int as n from public.profiles where role = 'admin') x
    union all
    select 'Data', 'styrelsekonton utan kopplad förening', case when n = 0 then 'OK' else 'KONTROLLERA' end,
           n || ' st (de ser ingenting förrän de kopplas till en förening)'
    from (select count(*)::int as n from public.profiles p
          where p.role = 'styrelse' and not exists (select 1 from public.styrelse_properties sp where sp.profile_id = p.id)) x
    union all
    select 'Data', 'styrelsekonton totalt', 'INFO', n || ' st'
    from (select count(*)::int as n from public.profiles where role = 'styrelse') x
    union all
    select 'Data', 'föreningar', 'INFO', n || ' st'
    from (select count(*)::int as n from public.properties) x
    union all
    select 'Data', 'lägenheter', 'INFO', n || ' st'
    from (select count(*)::int as n from public.apartments) x
    union all
    -- Testrader: räknas bara om tabellen finns (annars hade hela frågan fallerat)
    select 'Data', 'testrader i ' || t,
           case when to_regclass('public.' || t) is null then 'SAKNAS'
                when n = 0 then 'OK' else 'KONTROLLERA' end,
           case when to_regclass('public.' || t) is null then 'Tabellen finns inte.'
                else n || ' rader. Radera testraderna före skarp drift.' end
    from (
      select t,
             case when to_regclass('public.' || t) is null then 0
                  else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || t, false, true, '')))[1]::text::int
             end as n
      from unnest(array['parking_queue', 'laundry_code_requests', 'sublet_applications']) as t
    ) y
  )

select grupp, kontroll, status, kommentar
from (
  select * from forvantat_status
  union all select * from sekretess
  union all select * from sekretess_policy
  union all select * from data_kontroller
) alla
order by
  case status when 'SAKNAS' then 0 when 'KONTROLLERA' then 1 when 'VALFRITT SAKNAS' then 2 when 'INFO' then 3 else 4 end,
  grupp, kontroll;
