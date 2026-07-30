-- ============================================================================
-- DIAGNOS — "entreprenören ser inte sitt tilldelade ärende"
--
-- READ-ONLY. Ändrar ingenting. Kör i Supabase SQL editor, ett block i taget
-- (editorn visar bara resultatet av det sista uttrycket — markera ett block och
-- kör markeringen, eller kör dem en och en).
--
-- ---------------------------------------------------------------------------
-- VARFÖR
--
-- En entreprenör finns TVÅ gånger i systemet: som inloggning (`profiles`) och
-- som valbart namn i Ansvarig-menyn (`contacts`). `contacts.profile_id` är det
-- enda som binder dem ihop, och den kolumnen fylls i FÖR HAND — det finns ingen
-- automatisk koppling vid inbjudan.
--
-- Konsekvens: om admin i Ansvarig-menyn väljer en contacts-rad som INTE är
-- kopplad till någon inloggning, så är ärendet osynligt för entreprenören
-- överallt — Dag Rapport, fastigheten, allt. Det ser exakt ut som en bugg i
-- appen, men ärendet är tilldelat "ett namn" i stället för "en person".
-- Två contacts-rader för samma person (en från inbjudan, en skapad via
-- "+ Lägg till entreprenör") är precis så det här uppstår.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Har varje entreprenörsinloggning en kopplad contacts-rad?
--    contact_id = NULL  →  den inloggningen kan aldrig se något ärende alls.
-- ---------------------------------------------------------------------------
SELECT
  p.id            AS profile_id,
  p.full_name     AS inloggning,
  p.email,
  c.id            AS contact_id,
  c.full_name     AS kontaktnamn,
  c.company,
  c.active        AS kontakt_aktiv
FROM profiles p
LEFT JOIN contacts c ON c.profile_id = p.id
WHERE p.role = 'entreprenor'
ORDER BY p.full_name;


-- ---------------------------------------------------------------------------
-- 2. Dubbletter — samma entreprenör som flera contacts-rader.
--    rader > 1 och med_login < rader  →  det finns ett namn utan inloggning i
--    Ansvarig-menyn, och väljer admin det blir ärendet osynligt.
-- ---------------------------------------------------------------------------
SELECT
  COALESCE(NULLIF(TRIM(full_name), ''), '(namnlös)') AS namn,
  company,
  email,
  COUNT(*)              AS rader,
  COUNT(profile_id)     AS med_login,
  BOOL_OR(active)       AS nagon_aktiv
FROM contacts
WHERE contact_type = 'entreprenor'
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY rader DESC, namn;


-- ---------------------------------------------------------------------------
-- 3. ⭐ HUVUDFRÅGAN: varje tilldelat ärende, och om det syns för en inloggning.
--
--    syns_for_inloggning = false  →  ärendet är tilldelat en contacts-rad utan
--    profile_id. DET är varför entreprenören inte ser det.
--    fastighet = NULL  →  ärendet saknar fastighet och kan inte visas i någon
--    fastighetslista (byggnadskorten utgår från property_id).
-- ---------------------------------------------------------------------------
--    NOTE: every column is cast ::text. `issues.status` and
--    `inspections.inspection_type` are ENUM columns, not text, and a UNION
--    matches types positionally — without the casts Postgres stops with
--    "42804: UNION types text and inspection_type cannot be matched".
SELECT 'felanmälan' AS typ, i.title::text AS rubrik, i.status::text AS livscykel,
       pr.name::text AS fastighet, c.full_name::text AS ansvarig,
       (c.profile_id IS NOT NULL) AS syns_for_inloggning, i.created_at
  FROM issues i
  JOIN contacts c ON c.id = i.assigned_contact_id
  LEFT JOIN properties pr ON pr.id = i.property_id
UNION ALL
SELECT 'besiktning', n.inspection_type::text, n.arende_status::text,
       pr.name::text, c.full_name::text, (c.profile_id IS NOT NULL), n.created_at
  FROM inspections n
  JOIN contacts c ON c.id = n.assigned_contact_id
  LEFT JOIN properties pr ON pr.id = n.property_id
UNION ALL
SELECT 'projekt', x.title::text, x.arende_status::text,
       pr.name::text, c.full_name::text, (c.profile_id IS NOT NULL), x.created_at
  FROM projects x
  JOIN contacts c ON c.id = x.assigned_contact_id
  LEFT JOIN properties pr ON pr.id = x.property_id
ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- 4. Om block 3 visar syns_for_inloggning = false — så här lagas det.
--    VÄLJ EN. Kör inget av detta förrän du läst block 1 och 2.
--
--    a) Kontakten är rätt person, den saknar bara sin inloggning:
--       UPDATE contacts SET profile_id = '<PROFILE-UUID>' WHERE id = '<CONTACT-UUID>';
--
--    b) Det finns en dubblett och ärendet hänger på den fel raden — flytta
--       ärendet till den kopplade kontakten och pensionera dubbletten
--       (radera den INTE: gamla ärenden pekar på den, se contacts-active-flag.sql):
--       UPDATE issues SET assigned_contact_id = '<KOPPLAD-CONTACT-UUID>'
--        WHERE assigned_contact_id = '<DUBBLETT-CONTACT-UUID>';
--       UPDATE contacts SET active = false WHERE id = '<DUBBLETT-CONTACT-UUID>';
--
--    Efter (a) eller (b): ladda om entreprenörens flik. Ärendet ska dyka upp i
--    Dag Rapport och på fastigheten.
-- ---------------------------------------------------------------------------
