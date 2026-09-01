-- ============================================================================
-- account-delegation.sql — "samma person, två konton"
--
-- Kör för hand i Supabase SQL Editor, som resten av supabase-functions/*.sql.
-- Säker att köra om i sin helhet: allt är IF NOT EXISTS / CREATE OR REPLACE /
-- ON CONFLICT DO NOTHING. Avsnitt 0 och 6 är enbart läsande.
--
-- ---------------------------------------------------------------------------
-- VAD DEN LÖSER
--
-- plattform@bayt.se och makkin@live.se är samma människa med två inloggningar.
-- Önskad regel, ordagrant från beställaren:
--
--     "när man är inloggad som plattform ska man komma åt båda,
--      när man är inloggad som makkin ska man bara se makkin"
--
-- Det är alltså INTE en sammanslagning: ingen inloggning tas bort, ingenting
-- skrivs över, och de två kontona fortsätter existera var för sig. Det som
-- byggs är en ENKELRIKTAD delegering — plattformskontot får arbeta som makkins
-- kontaktpost också, medan makkin bara har sin egen.
--
-- Varför inte flytta ärendena i stället: `assigned_contact_id` är historik.
-- Skrev vi om varje ärende till en gemensam kontakt skulle loggbok, historik
-- och gamla mejl peka på en person som aldrig fick jobbet. Delegeringen ändrar
-- vem som får *se* posten, inte vem den tillhörde.
--
-- ---------------------------------------------------------------------------
-- MEKANIKEN
--
-- En entreprenör finns två gånger: som inloggning (`profiles`) och som valbart
-- namn (`contacts`), sammanbundna av `contacts.profile_id`. Varje RLS-hjälpare
-- i systemet — has_apartment_assignment(), has_property_assignment(),
-- has_object_assignment(), is_my_arende() — börjar likadant:
--
--     FROM contacts c WHERE c.profile_id = auth.uid()
--
-- Kolumnen rymmer en profil per kontakt, så "två inloggningar, samma kontakt"
-- går inte att uttrycka i den. Den här filen lägger därför till en tabell vid
-- sidan av, `contact_delegations`, och byter ut raden ovan mot
--
--     FROM contacts c WHERE c.id IN (SELECT my_contact_ids())
--
-- i alla fyra hjälparna. `my_contact_ids()` är unionen av mina egna kontakter
-- och de som delegerats till mig. Ingen befintlig koppling rörs: en inloggning
-- utan delegeringsrader får exakt samma svar som förut.
--
-- SAMMA REGEL FINNS I TRE SPRÅK och de måste ändras ihop:
--   * my_contact_ids()                         — här
--   * useMyContactIds()                        — src/hooks/useMyContactId.ts
--   * contactsForEmail()/delegatedContactIds() — supabase-functions/entreprenor-portal.ts
-- Samma kontrakt som normalizeTrappa ↔ submit-felanmalan.ts.
--
-- ---------------------------------------------------------------------------
-- FÖRUTSÄTTNING
-- is_admin() måste finnas (skapad för hand i dashboarden, ingen DDL i repot —
-- se admin-delete.sql). Avsnitt 0 kontrollerar det.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — ENBART LÄSANDE. Kör först och läs utskriften.
--
--    Fråga 1: finns is_admin()? Måste vara true.
--    Fråga 2: vilka är de två kontona, och vilken roll har de? Rollen avgör vad
--             delegeringen faktiskt gör:
--               - plattform = entreprenor → makkins ärenden dyker upp i
--                 plattformskontots Dag Rapport och ärendelistor.
--               - plattform = admin       → kontot ser redan allt; delegeringen
--                 blir en no-op och rätt vy är i stället /entreprenorer.
--             Kör avsnitt 5 oavsett — den är ofarlig i båda fallen.
--    Fråga 3: kontaktposterna och hur många ärenden som hänger på var och en.
--             Står det 0 ärenden på makkins kontakt är det INTE delegeringen
--             som saknas, utan tilldelningen.
-- ---------------------------------------------------------------------------
SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') AS has_is_admin;

SELECT p.id, p.email, p.full_name, p.role, p.created_at
  FROM profiles p
 WHERE lower(btrim(p.email)) IN ('plattform@bayt.se', 'makkin@live.se')
 ORDER BY p.created_at;

SELECT c.id,
       c.full_name,
       c.company,
       c.email,
       c.contact_type,
       c.profile_id,
       (SELECT count(*) FROM issues      i WHERE i.assigned_contact_id = c.id) AS felanmalningar,
       (SELECT count(*) FROM inspections n WHERE n.assigned_contact_id = c.id) AS besiktningar,
       (SELECT count(*) FROM projects    x WHERE x.assigned_contact_id = c.id) AS projekt
  FROM contacts c
 WHERE lower(btrim(coalesce(c.email, ''))) IN ('plattform@bayt.se', 'makkin@live.se')
    OR c.profile_id IN (
         SELECT id FROM profiles
          WHERE lower(btrim(email)) IN ('plattform@bayt.se', 'makkin@live.se')
       )
 ORDER BY c.created_at;


-- ---------------------------------------------------------------------------
-- 1. Tabellen
--
--    En rad = "den här inloggningen får också arbeta som den här kontakten".
--    Bägge sidorna kaskaderar: försvinner kontakten eller kontot är
--    delegeringen meningslös och ska inte ligga kvar som en spökrad.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_delegations (
  contact_id  uuid        NOT NULL REFERENCES public.contacts(id)  ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (contact_id, profile_id)
);

COMMENT ON TABLE public.contact_delegations IS
  'Enkelriktad delegering: profile_id får läsa och arbeta med ärenden tilldelade contact_id, utöver sina egna kontakter. Läses av my_contact_ids(). Ger INGEN åtkomst åt andra hållet.';

-- Uppslaget går alltid "vilka kontakter har jag fått?", aldrig tvärtom.
CREATE INDEX IF NOT EXISTS contact_delegations_profile_idx
  ON public.contact_delegations (profile_id);


-- ---------------------------------------------------------------------------
-- 2. RLS
--
--    Att slå på RLS här motsäger inte varningen i CLAUDE.md om att aldrig göra
--    det: den gäller BEFINTLIGA tabeller som appen redan läser och skriver, där
--    en enda ny policy skulle strypa allt annat. Den här tabellen är ny och
--    ingen kod har läst den förut, så de fyra reglerna nedan är hela dess värld.
--
--    Läsning: admin allt, och var och en sina egna delegeringar (entreprenörens
--    klient läser dem i useMyContactIds). Ingen får se vem ANNARS som har fått
--    en kontakt delegerad.
--    Skrivning: bara admin. Att dela ut någon annans ärenden är ett
--    administrativt beslut.
-- ---------------------------------------------------------------------------
ALTER TABLE public.contact_delegations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.contact_delegations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.contact_delegations TO authenticated;
REVOKE ALL ON public.contact_delegations FROM anon;

DROP POLICY IF EXISTS contact_delegations_select ON public.contact_delegations;
CREATE POLICY contact_delegations_select ON public.contact_delegations
FOR SELECT TO authenticated
USING (is_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS contact_delegations_insert ON public.contact_delegations;
CREATE POLICY contact_delegations_insert ON public.contact_delegations
FOR INSERT TO authenticated
WITH CHECK (is_admin());

DROP POLICY IF EXISTS contact_delegations_update ON public.contact_delegations;
CREATE POLICY contact_delegations_update ON public.contact_delegations
FOR UPDATE TO authenticated
USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS contact_delegations_delete ON public.contact_delegations;
CREATE POLICY contact_delegations_delete ON public.contact_delegations
FOR DELETE TO authenticated
USING (is_admin());


-- ---------------------------------------------------------------------------
-- 3. my_contact_ids() — den enda definitionen av "kontakter jag får arbeta som"
--
--    SECURITY DEFINER av samma två skäl som audit-events.sql redan betalat för:
--      a) 42P17. Anropas den ur en policy på `contacts` (eller på något som
--         `contacts` i sin tur pekar på) återinträder en vanlig subquery i
--         policyerna och Postgres avbryter med "infinite recursion detected".
--      b) Frågan "vilka kontakter är mina?" måste besvaras mot HELA tabellen,
--         inte mot de rader anroparen redan får se, annars är testet cirkulärt.
--
--    STABLE, inte VOLATILE: den anropas en gång per kandidatrad i varje policy
--    nedan och måste få cachas inom satsen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_contact_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT c.id FROM contacts c WHERE c.profile_id = auth.uid()
  UNION
  SELECT d.contact_id FROM contact_delegations d WHERE d.profile_id = auth.uid();
$$;

COMMENT ON FUNCTION public.my_contact_ids() IS
  'Kontaktposterna inloggad användare får arbeta som: egna (contacts.profile_id) plus delegerade (contact_delegations). Speglas av useMyContactIds i src/hooks/useMyContactId.ts — ändras den ena måste den andra ändras.';

GRANT EXECUTE ON FUNCTION public.my_contact_ids() TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. De fyra hjälparna, omskrivna
--
--    Enda ändringen i var och en är villkoret överst:
--        FÖRE:  WHERE c.profile_id = auth.uid()
--        EFTER: WHERE c.id IN (SELECT my_contact_ids())
--    Kropparna är i övrigt ordagrant desamma som i audit-events.sql,
--    entreprenor-read-scope.sql och property-objects-scoped-rls.sql. Ändra du
--    något annat i dem här måste samma ändring in i originalfilen — de är
--    avsiktliga kopior och får inte glida isär.
--
--    Ingen policy skrivs om: alla fyra anropas redan från sina policies, och en
--    vidgad hjälpare vidgar dem automatiskt. En inloggning utan delegeringar får
--    exakt samma svar som före den här filen.
-- ---------------------------------------------------------------------------

-- "Har jag ett ärende i den här lägenheten?" (audit-events.sql §5,
-- entreprenor-read-scope.sql §1a). Projekt saknas med flit: `projects` har
-- ingen apartment_id-kolumn, så ett projekt kan aldrig ge tillgång till en
-- lägenhet.
CREATE OR REPLACE FUNCTION public.has_apartment_assignment(p_apartment_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_apartment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id IN (SELECT my_contact_ids())
      AND (
        EXISTS (SELECT 1 FROM issues i
                 WHERE i.apartment_id = p_apartment_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n
                 WHERE n.apartment_id = p_apartment_id AND n.assigned_contact_id = c.id)
      )
  );
$$;

-- "Har jag ett ärende i den här fastigheten?" (entreprenor-read-scope.sql §1b).
-- Projekt räknas HÄR, till skillnad från lägenheten ovan: ett projekt är
-- byggnadsnivå och måste kunna öppna sin byggnad.
CREATE OR REPLACE FUNCTION public.has_property_assignment(p_property_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id IN (SELECT my_contact_ids())
      AND (
        EXISTS (SELECT 1 FROM issues      i WHERE i.property_id = p_property_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n WHERE n.property_id = p_property_id AND n.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM projects    x WHERE x.property_id = p_property_id AND x.assigned_contact_id = c.id)
      )
  );
$$;

-- "Har jag ett ärende mot det här objektet?" (property-objects-scoped-rls.sql).
CREATE OR REPLACE FUNCTION public.has_object_assignment(p_object_id uuid)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_object_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id IN (SELECT my_contact_ids())
      AND (
        EXISTS (SELECT 1 FROM issues i
                 WHERE i.property_object_id = p_object_id AND i.assigned_contact_id = c.id)
        OR EXISTS (SELECT 1 FROM inspections n
                 WHERE n.property_object_id = p_object_id AND n.assigned_contact_id = c.id)
      )
  );
$$;

-- "Är det här ärendet mitt?" (audit-events.sql §5).
CREATE OR REPLACE FUNCTION public.is_my_arende(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id IN (SELECT my_contact_ids()) AND (
         (p_entity_type = 'issue'      AND EXISTS (SELECT 1 FROM issues      x WHERE x.id = p_entity_id AND x.assigned_contact_id = c.id))
      OR (p_entity_type = 'inspection' AND EXISTS (SELECT 1 FROM inspections x WHERE x.id = p_entity_id AND x.assigned_contact_id = c.id))
      OR (p_entity_type = 'project'    AND EXISTS (SELECT 1 FROM projects    x WHERE x.id = p_entity_id AND x.assigned_contact_id = c.id))
    )
  );
$$;


-- ---------------------------------------------------------------------------
-- 5. SJÄLVA KOPPLINGEN — plattform@bayt.se får makkin@live.se:s kontakter
--
--    Riktningen är hela poängen och står bara skriven en gång, här:
--      delegate_to_email = kontot som ska se MER  (plattform)
--      source_email      = personen vars kontakter delas (makkin)
--    Byter du plats på de två vänder regeln, och makkin skulle se
--    plattformskontots ärenden.
--
--    Kontakterna hittas på två vägar, eftersom en kontaktpost inte alltid bär
--    sin ägares e-post: kontaktens egen adress ELLER kontaktens profile_id.
--
--    ON CONFLICT DO NOTHING gör hela avsnittet omkörbart.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  delegate_to_email CONSTANT text := 'plattform@bayt.se';
  source_email      CONSTANT text := 'makkin@live.se';
  v_delegate_id     uuid;
  v_linked          integer;
BEGIN
  SELECT id INTO v_delegate_id
    FROM profiles
   WHERE lower(btrim(email)) = delegate_to_email
   ORDER BY created_at
   LIMIT 1;

  IF v_delegate_id IS NULL THEN
    -- Hellre ett tydligt stopp än en tyst no-op: står inte kontot i profiles
    -- är e-posten felstavad eller inloggningen borttagen, och då ska den som
    -- kör filen få veta det.
    RAISE EXCEPTION 'Ingen profil med e-post % — inget att delegera till.', delegate_to_email;
  END IF;

  INSERT INTO contact_delegations (contact_id, profile_id, note)
  SELECT c.id,
         v_delegate_id,
         format('Samma person: %s = %s', delegate_to_email, source_email)
    FROM contacts c
   WHERE lower(btrim(coalesce(c.email, ''))) = source_email
      OR c.profile_id IN (
           SELECT id FROM profiles WHERE lower(btrim(email)) = source_email
         )
  ON CONFLICT (contact_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RAISE NOTICE 'Delegerade % kontaktpost(er) från % till %.', v_linked, source_email, delegate_to_email;

  IF v_linked = 0 THEN
    RAISE NOTICE 'Noll nya rader. Antingen är kopplingen redan gjord (kör avsnitt 6) eller så har % ingen kontaktpost alls — se avsnitt 0.', source_email;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 6. VERIFIERA — ENBART LÄSANDE.
--
--    a) Delegeringarna som finns, i klartext.
--    b) Vad plattformskontot numera får se. Kör den som en enkel simulering av
--       my_contact_ids() för just det kontot — funktionen själv läser auth.uid()
--       och ger inget vettigt svar i SQL-editorn, där ingen är inloggad.
--       Förväntat: plattformskontots egna kontakter PLUS makkins.
--    c) Motprovet, och det viktigaste i hela filen: makkins konto ska INTE ha
--       fått något. Kommer det tillbaka rader här är riktningen omkastad.
-- ---------------------------------------------------------------------------
SELECT d.created_at,
       p.email  AS delegerat_till,
       c.full_name AS kontakt,
       c.email  AS kontaktens_epost,
       d.note
  FROM contact_delegations d
  JOIN profiles p ON p.id = d.profile_id
  JOIN contacts c ON c.id = d.contact_id
 ORDER BY d.created_at DESC;

-- (b) plattform ser båda
SELECT 'plattform@bayt.se' AS inloggad, c.id, c.full_name, c.email,
       (SELECT count(*) FROM issues i WHERE i.assigned_contact_id = c.id) AS felanmalningar
  FROM contacts c
 WHERE c.profile_id IN (SELECT id FROM profiles WHERE lower(btrim(email)) = 'plattform@bayt.se')
    OR c.id IN (
         SELECT d.contact_id FROM contact_delegations d
          JOIN profiles p ON p.id = d.profile_id
         WHERE lower(btrim(p.email)) = 'plattform@bayt.se'
       )
 ORDER BY c.full_name;

-- (c) makkin ser bara sig själv — förväntat: inga delegeringsrader
SELECT 'makkin@live.se' AS inloggad, c.id, c.full_name, c.email,
       (SELECT count(*) FROM issues i WHERE i.assigned_contact_id = c.id) AS felanmalningar
  FROM contacts c
 WHERE c.profile_id IN (SELECT id FROM profiles WHERE lower(btrim(email)) = 'makkin@live.se')
    OR c.id IN (
         SELECT d.contact_id FROM contact_delegations d
          JOIN profiles p ON p.id = d.profile_id
         WHERE lower(btrim(p.email)) = 'makkin@live.se'
       )
 ORDER BY c.full_name;
