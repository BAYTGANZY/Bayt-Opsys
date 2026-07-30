-- ============================================================================
-- RESET TESTDATA — töm all verksamhetsdata, behåll konton.
--
-- Kör för hand i Supabase SQL editor. DESTRUKTIVT OCH OÅTERKALLELIGT.
-- Ta en backup först (Dashboard → Database → Backups) om det finns något
-- i databasen du inte vill förlora.
--
-- BEHÅLLS:
--   * auth.users + profiles          — alla inloggningar
--   * contacts                       — kontaktregistret (property_id nollställs)
--   * cost_categories                — global kostnadskatalog (id/namn/färg)
--   * account_memory                 — rollhistorik för raderade konton
--   * storage-buckets                — se PUNKT 4 nedan, filerna ligger kvar
--
-- RENSAS:
--   fastigheter, lägenheter, felanmälningar, besiktningar, projekt, objekt,
--   dokumentposter, loggbok + kommentarer, åtgärder, fastighetshistorik,
--   bilder, protokollposter, statushistorik, budgetar, Historik (audit_events),
--   styrelsens fastighetskopplingar, property_access, samt hela chatten.
--
-- Listan är komplett mot public-schemat: verifierad 2026-07-29 mot samtliga 25
-- basbetabeller utanför behåll-listan. Läggs en ny tabell till i databasen måste
-- den läggas till i `targets` nedan, annars överlever dess rader varje reset.
--
-- ---------------------------------------------------------------------------
-- SÄKERT ATT KÖRA ÄVEN OM TABELLER SAKNAS
-- Varje DELETE är villkorad på to_regclass(), så tabeller som aldrig migrerats
-- in hoppas över med en NOTICE istället för att spränga scriptet.
--
-- ORDNINGEN ÄR INTE KOSMETISK
--   * Barn före förälder — scriptet förlitar sig INTE på att cascade-svepet i
--     admin-delete.sql är kört. Om det är kört skadar det inget att radera
--     barnen först ändå.
--   * audit_events ligger SIST. audit_log_changes() triggar på DELETE och
--     skriver "Tog bort …"-rader för varje ärende vi raderar; städas de inte
--     efteråt startar den nya testomgången med en Historik full av spöken.
--   * contacts.property_id nollställs FÖRE properties raderas, så att FK:n
--     inte kan blockera om just den constrainten saknar ON DELETE SET NULL.
-- ============================================================================

DO $$
DECLARE
  t         text;
  n         bigint;
  total     bigint := 0;
  skipped   text[] := '{}';
  -- Barn → förälder. audit_events allra sist, se kommentaren ovan.
  targets   text[] := ARRAY[
    -- chatt (fristående från fastighetsdatan, men ska också tömmas)
    'chat_messages',
    'chat_participants',
    'chat_conversations',
    -- ärendenas barn
    'issue_images',
    'issue_comments',
    'issue_status_history',
    'project_images',
    'inspection_protocols',
    -- loggbok
    'logbook_comments',
    'logbook_entries',
    -- övrigt fastighetsinnehåll
    'documents',
    'actions',
    'property_history',
    -- ekonomi (cost_categories behålls som katalog)
    'budget_items',
    'property_budgets',
    -- ärendena själva
    'issues',
    'inspections',
    'projects',
    -- fysiska enheter
    'property_objects',
    'apartments',
    -- rollkopplingar mot byggnad
    'styrelse_properties',
    -- property_access finns i databasen men används inte av frontend (ingen
    -- .from("property_access") i src/). Töms ändå: raderna pekar på properties
    -- och skulle annars överleva en reset som dinglande referenser.
    'property_access',
    -- förälder
    'properties',
    -- allra sist: städa bort raderingsspåren ovan
    'audit_events'
  ];
BEGIN
  -- Nollställ kontakternas fastighetskoppling innan byggnaderna försvinner.
  IF to_regclass('public.contacts') IS NOT NULL THEN
    UPDATE contacts SET property_id = NULL WHERE property_id IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'contacts.property_id nollställd på % rader (kontakterna behålls)', n;
  END IF;

  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      skipped := skipped || t;
      CONTINUE;
    END IF;
    EXECUTE format('DELETE FROM public.%I', t);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    RAISE NOTICE '% rader raderade: %', lpad(n::text, 6), t;
  END LOOP;

  RAISE NOTICE '--------------------------------------------';
  RAISE NOTICE 'TOTALT % rader raderade', total;
  IF array_length(skipped, 1) IS NOT NULL THEN
    RAISE NOTICE 'Tabeller som inte finns (överhoppade): %', array_to_string(skipped, ', ');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- VERIFIERA — READ-ONLY. Kör efter blocket ovan.
--
-- Räknar VARJE basbetabell i public, inte en handskriven lista: en tabell som
-- läggs till i databasen men glöms bort i `targets` dyker då upp här med rader
-- kvar i stället för att tyst överleva resetten. (Den gamla versionen listade
-- 10 av 25 tabeller och kunde därför rapportera "allt tomt" med data kvar.)
--
-- Förväntat: status = 'TOM' överallt utom raderna märkta BEHÅLLS.
-- ---------------------------------------------------------------------------
SELECT c.relname AS tabell,
       CASE WHEN c.relname IN ('profiles','contacts','cost_categories','account_memory')
            THEN 'BEHÅLLS' ELSE 'ska vara tom' END AS forvantat,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                           false, true, '')))[1]::text::bigint AS rader
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY forvantat, rader DESC, tabell;


-- ---------------------------------------------------------------------------
-- PUNKT 4 — EFTERARBETE SOM SCRIPTET INTE GÖR
--
-- 1. STORAGE. Filerna i bucketarna `documents`, `protocols`, `avatars` (och
--    ev. issue-/projektbilder) ligger kvar som föräldralösa objekt — raderade
--    poster i `documents`/`issue_images` tar inte med sig blobben. Töm dem
--    manuellt i Dashboard → Storage om du vill ha helt rent. Avatars bör du
--    dock behålla, de hör till kontona.
--
-- 2. STYRELSENS FASTIGHETER. styrelse_properties tömdes med resten, så varje
--    styrelsekonto ser noll byggnader tills du kopplar dem på nytt under
--    Inställningar → Användare. Detta är väntat, inte en bugg att rapportera.
--
-- 3. INAKTIVA KONTAKTER. Kontakter med active = false ligger kvar och syns
--    fortfarande inte i Ansvarig-dropdownen. Vill du ha ett rent register:
--      UPDATE contacts SET active = true;              -- återaktivera alla
--      -- eller: DELETE FROM contacts WHERE profile_id IS NULL;
--
-- 4. AUDIT/HISTORIK. audit_events ÄR applicerad i den här databasen — verifierat
--    2026-07-29: tabellen innehöll 12 rader före första resetten. (CLAUDE.md och
--    en tidigare version av den här kommentaren påstod motsatsen; det stämmer
--    inte längre.) Triggarna skriver alltså "Tog bort …"-rader medan blocket
--    ovan raderar ärendena, vilket är hela skälet till att audit_events ligger
--    sist i targets — flyttas den uppåt startar nästa testomgång med en Historik
--    full av spöken från resetten.
-- ---------------------------------------------------------------------------
