-- ============================================================================
-- KONTOKONTINUITET — "samma e-post = samma person"
--
-- Run by hand in the Supabase SQL editor, top to bottom. Safe to re-run in
-- full: every statement is CREATE OR REPLACE / IF NOT EXISTS / DROP … IF EXISTS,
-- and the backfill in section 7 is idempotent.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM THIS REMOVES
--
-- An entreprenör exists twice: as a login (`profiles`) and as a pickable name
-- (`contacts`). `contacts.profile_id` is the bridge, and *every* entreprenör
-- read path in the app goes through it:
--
--   useMyContactId.ts          → dina ärenden på Dag Rapport
--   has_apartment_assignment() → RLS: läsa lägenheten
--   has_property_assignment()  → RLS: läsa fastigheten (fastighetsgridarna)
--   is_my_arende()             → RLS: Historik
--
-- Deleting a user removes the profiles row. The FK nulls `contacts.profile_id`
-- out, and nothing ever puts it back — the link was populated BY HAND. Invite
-- the exact same person with the exact same e-post and they get a brand new
-- profiles.id that matches nothing. Result: alla listor tomma, gula rutan
-- "Ditt konto är inte kopplat till någon kontaktpost", och alla deras gamla
-- ärenden osynliga trots att raderna ligger kvar i databasen.
--
-- Samma sak för styrelse: `styrelse_properties` är FK:ad mot profiles med
-- ON DELETE CASCADE, så fastighetskopplingarna försvinner helt vid radering.
-- Och för chatt: `chat_participants` cascade-raderas likaså.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES INSTEAD
--
--   Radering  = kontot minns (snapshot i `account_memory`), kontakten
--               pensioneras (active = false). Inloggningen är borta, alltså är
--               åtkomsten borta — exakt som förut.
--   Inbjudan  = om e-posten känns igen återställs kopplingarna automatiskt:
--               kontaktposten återaktiveras och pekas om till det nya kontot,
--               styrelsens fastigheter läggs tillbaka, chattrådarna likaså.
--
-- Nyckeln är NORMALISERAD E-POST (lower + trim), inte profiles.id. Det är den
-- enda identifieraren som överlever en radering.
--
-- Ingen del av det här ger någon extra åtkomst: en raderad användare kan inte
-- logga in, och `account_memory` är oläsbar för både anon och authenticated.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — READ-ONLY. Kör först och läs utskriften.
--
--    has_contacts_profile_id och has_contacts_active MÅSTE vara true (de kommer
--    från entreprenor-read-scope.sql resp. contacts-active-flag.sql).
--    contacts_property_id_nullable bör vara YES (global-entreprenor.sql) — är
--    den NO kan sektion 4 inte skapa en saknad kontaktpost automatiskt; den
--    loggar då en varning och kopplar bara ihop befintliga poster.
--    styrelse_properties / chat_participants som saknas är helt OK: allt sådant
--    är villkorat på to_regclass() nedan och hoppas tyst över.
-- ---------------------------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'profile_id') AS has_contacts_profile_id,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'active')     AS has_contacts_active,
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'property_id')      AS contacts_property_id_nullable,
  to_regclass('public.styrelse_properties') IS NOT NULL                                             AS has_styrelse_properties,
  to_regclass('public.chat_participants')   IS NOT NULL                                             AS has_chat_participants;

-- Hur illa är det just nu? Varje rad här är ett konto som tappat sin koppling.
SELECT p.id, p.email, p.role, c.id AS contact_id, c.active AS contact_active
  FROM profiles p
  LEFT JOIN contacts c ON c.profile_id = p.id
 WHERE p.role::text = 'entreprenor'
 ORDER BY p.email;


-- ---------------------------------------------------------------------------
-- 1. account_memory — vad systemet minns om en raderad inloggning.
--
--    Nyckeln är normaliserad e-post. En rad per person, inte per radering:
--    raderas och bjuds någon in tre gånger skrivs samma rad över.
--
--    contact_id är ON DELETE SET NULL: raderas kontaktposten på riktigt (via
--    Kontakter) ska minnet inte peka på ett spöke.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_memory (
  email                 TEXT PRIMARY KEY,
  profile_id            UUID,                 -- senast kända inloggning (historik)
  full_name             TEXT,
  role                  TEXT,
  phone                 TEXT,
  contact_id            UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  styrelse_property_ids UUID[] NOT NULL DEFAULT '{}',
  chat_memberships      JSONB  NOT NULL DEFAULT '[]'::jsonb,
  deleted_at            TIMESTAMPTZ,
  restored_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_memory IS
  'Vad ett raderat konto hade, nycklat på normaliserad e-post. Bjuds samma e-post in igen återställs kopplingarna automatiskt (profiles_restore_account). Enbart SECURITY DEFINER-funktioner rör den här tabellen.';

-- Innehåller e-post och rollhistorik: ingen klient ska kunna läsa den.
-- Triggarna nedan är SECURITY DEFINER och körs som ägaren, så de påverkas inte.
ALTER TABLE public.account_memory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_memory FROM anon, authenticated;

-- Uppslag "hitta kontakten för den här e-posten" sker vid varje inbjudan.
CREATE INDEX IF NOT EXISTS contacts_email_lower_idx
  ON public.contacts (lower(btrim(email))) WHERE email IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 2. link_or_create_contact — den enda platsen som kopplar login → kontaktpost.
--
--    Anropas från tre håll: återställningstriggern (sektion 4), självläkningen
--    som frontend kallar (sektion 6) och backfillen (sektion 7). En definition,
--    annars börjar de tre divergera.
--
--    Ordningen är avsiktlig:
--      1. Redan kopplad? Klart.
--      2. Ihågkommen kontaktpost från account_memory (skickas in som hint).
--      3. Kontaktpost med samma e-post — täcker konton som raderades INNAN den
--         här filen fanns, och kontakter som admin lagt upp för hand.
--      4. Skapa en ny, men bara för entreprenörer (p_create). En styrelse- eller
--         adminanvändare ska inte hamna i Ansvarig-dropdownen.
--
--    Kopplingen återaktiverar kontakten (active = true) BARA om den nya rollen
--    är entreprenör — poängen med hela filen är att en återvändande
--    entreprenör ska kunna ta vid där de slutade, inte att en person som
--    kommer tillbaka som styrelse/admin dyker upp som pickbar entreprenör.
--    En inaktiv kontakt går inte att tilldela nya ärenden.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_or_create_contact(
  p_profile_id           UUID,
  p_preferred_contact_id UUID    DEFAULT NULL,
  p_create               BOOLEAN DEFAULT TRUE
)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_email   TEXT;
  v_id      UUID;
BEGIN
  IF p_profile_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_email := nullif(lower(btrim(v_profile.email)), '');

  -- 1. Redan kopplad.
  SELECT id INTO v_id
    FROM contacts
   WHERE profile_id = p_profile_id
   ORDER BY active DESC, created_at DESC
   LIMIT 1;

  -- 2. Ihågkommen kontaktpost (kan ha hunnit raderas på riktigt sedan dess).
  IF v_id IS NULL AND p_preferred_contact_id IS NOT NULL THEN
    SELECT id INTO v_id FROM contacts WHERE id = p_preferred_contact_id;
  END IF;

  -- 3. Samma e-post. Kontakter utan e-post matchar aldrig — se sektion 7 för
  --    hur de kopplas för hand.
  IF v_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_id
      FROM contacts
     WHERE lower(btrim(email)) = v_email
       AND (profile_id IS NULL OR profile_id = p_profile_id)
     ORDER BY active DESC, created_at DESC
     LIMIT 1;
  END IF;

  -- 4. Skapa. Bara för entreprenörer, och bara om anroparet ber om det.
  --
  --    ::text överallt där profiles.role rörs: kolumnen är enumen `user_role`,
  --    och coalesce(role, '') försöker då tolka tomma strängen som ett
  --    enumvärde — 22P02 invalid input value for enum. Jämför som text i
  --    stället, så spelar det ingen roll om enumen får fler värden senare.
  IF v_id IS NULL THEN
    IF NOT p_create OR coalesce(v_profile.role::text, '') <> 'entreprenor' THEN
      RETURN NULL;
    END IF;
    BEGIN
      INSERT INTO contacts (full_name, contact_type, email, active, profile_id)
      VALUES (
        coalesce(nullif(btrim(v_profile.full_name), ''), v_email, 'Entreprenör'),
        'entreprenor',
        v_email,
        TRUE,
        p_profile_id
      )
      RETURNING id INTO v_id;
    EXCEPTION WHEN OTHERS THEN
      -- Vanligaste orsaken: contacts.property_id är fortfarande NOT NULL, dvs
      -- global-entreprenor.sql är inte körd. Kontot fungerar ändå så fort admin
      -- lägger upp kontakten för hand — det här ska inte spränga en inbjudan.
      RAISE WARNING 'link_or_create_contact: kunde inte skapa kontaktpost för % (%): %',
        p_profile_id, coalesce(v_email, '-'), SQLERRM;
      RETURN NULL;
    END;
    RETURN v_id;
  END IF;

  -- Befintlig post: peka om till det nya kontot. Aktiveras (active = true) BARA
  -- om den nya rollen är entreprenör — annars förblir den pensionerad. Utan det
  -- här villkoret dyker en person som raderas som entreprenör och sedan bjuds
  -- in igen som styrelse/admin upp som en pickbar (men obefintlig) entreprenör
  -- i Ansvarig-dropdownen, trots att inloggningen inte längre är entreprenör.
  -- profile_id sätts oavsett roll — posten hör till personen och gamla ärenden
  -- ska fortfarande kunna slå upp namnet.
  UPDATE contacts
     SET profile_id = p_profile_id,
         active     = (coalesce(v_profile.role::text, '') = 'entreprenor'),
         email      = coalesce(nullif(btrim(email), ''), v_email)
   WHERE id = v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.link_or_create_contact(UUID, UUID, BOOLEAN) IS
  'Kopplar en inloggning till sin kontaktpost (profil → contacts.profile_id): befintlig koppling, ihågkommen post, samma e-post, annars ny post för entreprenörer. Reaktiverar (active=true) bara om profilens roll är entreprenor. Returnerar contacts.id eller NULL.';


-- ---------------------------------------------------------------------------
-- 3. Radering — minns kontot, pensionera kontakten.
--
--    BEFORE DELETE, inte AFTER: `styrelse_properties` och `chat_participants`
--    är ON DELETE CASCADE, så efter raderingen finns det inget kvar att
--    fotografera. Och profile_id nollas här, medvetet och i förväg, i stället
--    för att lämnas åt FK:ns beteende.
--
--    Hela kroppen ligger i EXCEPTION WHEN OTHERS av samma skäl som
--    audit_log_changes(): ett misslyckat minne får aldrig blockera en radering
--    som admin faktiskt bett om.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_remember_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email      TEXT;
  v_contact_id UUID;
  v_props      UUID[]  := '{}';
  v_chat       JSONB   := '[]'::jsonb;
BEGIN
  v_email := nullif(lower(btrim(OLD.email)), '');
  IF v_email IS NULL THEN
    -- Utan e-post finns ingen nyckel att komma ihåg personen på. Kontakten
    -- pensioneras ändå — den får inte ligga kvar i Ansvarig-dropdownen.
    UPDATE contacts SET active = FALSE, profile_id = NULL WHERE profile_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT id INTO v_contact_id
    FROM contacts WHERE profile_id = OLD.id
   ORDER BY active DESC, created_at DESC LIMIT 1;

  IF to_regclass('public.styrelse_properties') IS NOT NULL THEN
    SELECT coalesce(array_agg(property_id), '{}')
      INTO v_props FROM styrelse_properties WHERE profile_id = OLD.id;
  END IF;

  IF to_regclass('public.chat_participants') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'conversation_id', conversation_id,
             'last_read_at',    last_read_at)), '[]'::jsonb)
      INTO v_chat FROM chat_participants WHERE profile_id = OLD.id;
  END IF;

  INSERT INTO account_memory AS m (
    email, profile_id, full_name, role, phone,
    contact_id, styrelse_property_ids, chat_memberships, deleted_at, updated_at
  )
  VALUES (
    -- OLD.role::text: account_memory.role är TEXT och profiles.role är enumen
    -- user_role. Postgres har ingen implicit cast enum → text ens vid INSERT.
    v_email, OLD.id, OLD.full_name, OLD.role::text, OLD.phone,
    v_contact_id, v_props, v_chat, now(), now()
  )
  ON CONFLICT (email) DO UPDATE SET
    profile_id            = EXCLUDED.profile_id,
    full_name             = coalesce(EXCLUDED.full_name, m.full_name),
    role                  = coalesce(EXCLUDED.role, m.role),
    phone                 = coalesce(EXCLUDED.phone, m.phone),
    contact_id            = coalesce(EXCLUDED.contact_id, m.contact_id),
    -- Tomma listor skriver inte över ett tidigare minne: raderas ett konto som
    -- redan var tomt ska förra rundans kopplingar inte försvinna.
    styrelse_property_ids = CASE WHEN cardinality(EXCLUDED.styrelse_property_ids) > 0
                                 THEN EXCLUDED.styrelse_property_ids ELSE m.styrelse_property_ids END,
    chat_memberships      = CASE WHEN jsonb_array_length(EXCLUDED.chat_memberships) > 0
                                 THEN EXCLUDED.chat_memberships ELSE m.chat_memberships END,
    deleted_at            = EXCLUDED.deleted_at,
    restored_at           = NULL,
    updated_at            = now();

  -- Pensionera, radera aldrig: assigned_contact_id på gamla ärenden pekar hit
  -- och de måste fortsätta visa vem som var ansvarig.
  IF v_contact_id IS NOT NULL THEN
    UPDATE contacts SET active = FALSE, profile_id = NULL WHERE id = v_contact_id;
  END IF;

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'profiles_remember_account: kunde inte spara konto % : %', OLD.id, SQLERRM;
  RETURN OLD;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. Inbjudan — återställ allt som hörde till e-posten.
--
--    Rollen som gäller är den NYA. Bjuds någon tillbaka som styrelse i stället
--    för entreprenör återställs styrelsens fastigheter men ingen ny
--    kontaktpost skapas — kontaktkopplingen återställs ändå, eftersom posten
--    tillhör personen och deras gamla ärenden fortfarande pekar på den.
--
--    Körs även AFTER UPDATE OF role, email: ett konto som byter roll till
--    entreprenör ska få sin koppling direkt, inte först vid nästa inbjudan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_restore_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email      TEXT;
  m            account_memory%ROWTYPE;
  v_contact_id UUID;
  v_row        JSONB;
BEGIN
  v_email := nullif(lower(btrim(NEW.email)), '');

  IF v_email IS NOT NULL THEN
    SELECT * INTO m FROM account_memory WHERE email = v_email;
  END IF;

  -- 1. Kontaktposten. Sker för alla roller och även utan minnesrad — då är det
  --    e-postmatchningen i link_or_create_contact som gör jobbet, vilket är
  --    exakt det som lagar konton raderade före den här filen fanns.
  v_contact_id := link_or_create_contact(
    NEW.id,
    m.contact_id,
    coalesce(NEW.role::text, '') = 'entreprenor'
  );

  -- 2. Styrelsens fastigheter.
  IF coalesce(NEW.role::text, '') = 'styrelse'
     AND m.email IS NOT NULL
     AND cardinality(m.styrelse_property_ids) > 0
     AND to_regclass('public.styrelse_properties') IS NOT NULL THEN
    INSERT INTO styrelse_properties (profile_id, property_id)
    SELECT NEW.id, pid
      FROM unnest(m.styrelse_property_ids) AS pid
     WHERE EXISTS (SELECT 1 FROM properties p WHERE p.id = pid)   -- huset kan vara borta
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3. Chattrådarna, inklusive var de slutade läsa.
  IF m.email IS NOT NULL
     AND jsonb_array_length(m.chat_memberships) > 0
     AND to_regclass('public.chat_participants') IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(m.chat_memberships) LOOP
      INSERT INTO chat_participants (conversation_id, profile_id, last_read_at)
      SELECT (v_row->>'conversation_id')::uuid, NEW.id, (v_row->>'last_read_at')::timestamptz
       WHERE EXISTS (SELECT 1 FROM chat_conversations c
                      WHERE c.id = (v_row->>'conversation_id')::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- 4. Kvittera. Minnesraden ligger kvar — nästa radering skriver över den, och
  --    under tiden är den svaret på "vad hade det här kontot innan?".
  IF v_email IS NOT NULL THEN
    INSERT INTO account_memory (email, profile_id, full_name, role, phone, contact_id, restored_at, updated_at)
    VALUES (v_email, NEW.id, NEW.full_name, NEW.role::text, NEW.phone, v_contact_id, now(), now())
    ON CONFLICT (email) DO UPDATE SET
      profile_id  = EXCLUDED.profile_id,
      full_name   = coalesce(EXCLUDED.full_name, account_memory.full_name),
      role        = EXCLUDED.role,
      phone       = coalesce(EXCLUDED.phone, account_memory.phone),
      contact_id  = coalesce(EXCLUDED.contact_id, account_memory.contact_id),
      restored_at = now(),
      updated_at  = now();
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'profiles_restore_account: kunde inte återställa konto % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS profiles_remember_account_trg ON public.profiles;
CREATE TRIGGER profiles_remember_account_trg
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_remember_account();

DROP TRIGGER IF EXISTS profiles_restore_account_trg ON public.profiles;
CREATE TRIGGER profiles_restore_account_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_restore_account();

DROP TRIGGER IF EXISTS profiles_restore_account_upd_trg ON public.profiles;
CREATE TRIGGER profiles_restore_account_upd_trg
  AFTER UPDATE OF role, email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_restore_account();


-- ---------------------------------------------------------------------------
-- 5. Radera användaren i auth.users också? Nej — men värt att veta.
--
--    invite-user raderar auth-användaren, vilket i sin tur raderar profiles-
--    raden om FK:n är ON DELETE CASCADE. Triggern i sektion 3 hänger på
--    `profiles`, så den fångar båda vägarna: raderas profilen direkt eller via
--    kaskad från auth.users kör BEFORE DELETE ändå.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 6. ensure_my_contact_link — självläkning, anropad av frontend.
--
--    useMyContactId.ts kallar den här när uppslaget på profile_id kom tillbaka
--    tomt. Den tar inga argument och rör bara auth.uid(): en inloggad kan bara
--    laga sin egen koppling, aldrig någon annans. Det är det som gör att den
--    gula "inte kopplad till någon kontaktpost"-rutan aldrig behöver visas
--    igen — även för konton som skapades utanför den här filens triggrar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_contact_link()
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN link_or_create_contact(auth.uid(), NULL, coalesce(v_role, '') = 'entreprenor');
END;
$$;

COMMENT ON FUNCTION public.ensure_my_contact_link() IS
  'Ser till att den inloggade har en kontaktpost och att den pekar på det aktuella kontot. Rör bara auth.uid(). Anropas av useMyContactId.ts.';

REVOKE ALL ON FUNCTION public.ensure_my_contact_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_contact_link() TO authenticated;

-- link_or_create_contact tar ett godtyckligt profile_id och får därför ALDRIG
-- exponeras mot klienten — bara triggrarna, backfillen och wrappern ovan.
REVOKE ALL ON FUNCTION public.link_or_create_contact(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. BACKFILL — laga konton som redan tappat kopplingen.
--
--    Kör den här EN gång. Den går igenom alla befintliga inloggningar och
--    kopplar ihop dem med sin kontaktpost via e-post, och skapar en post för
--    entreprenörer som saknar en. Det är det här steget som får den trasiga
--    entreprenören att fungera igen — inklusive alla deras gamla ärenden, som
--    aldrig försvann, bara blev oläsbara.
-- ---------------------------------------------------------------------------
SELECT p.email,
       p.role,
       public.link_or_create_contact(p.id, NULL, p.role::text = 'entreprenor') AS contact_id
  FROM public.profiles p
 ORDER BY p.role, p.email;

-- Kontakten saknar e-post och matchade därför ingenting? Koppla för hand:
--
--   UPDATE contacts
--      SET profile_id = '<PROFILE-UUID>', active = true,
--          email = (SELECT email FROM profiles WHERE id = '<PROFILE-UUID>')
--    WHERE id = '<CONTACT-UUID>';
--
-- Lista kandidaterna:
--
--   SELECT id, full_name, company, email, active, profile_id, created_at
--     FROM contacts
--    WHERE contact_type = 'entreprenor' AND profile_id IS NULL
--    ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- 8. VERIFY — READ-ONLY.
--    Förväntat: varje entreprenörsinloggning har ett contact_id och
--    contact_active = true. Är contact_id NULL kunde ingen post skapas — läs
--    preflightens contacts_property_id_nullable och kör global-entreprenor.sql.
-- ---------------------------------------------------------------------------
SELECT p.email, p.role, c.id AS contact_id, c.full_name AS contact_name, c.active AS contact_active
  FROM public.profiles p
  LEFT JOIN public.contacts c ON c.profile_id = p.id
 ORDER BY p.role, p.email;

SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
 ORDER BY tgname;

SELECT proname, prosecdef AS is_security_definer
  FROM pg_proc
 WHERE proname IN ('link_or_create_contact', 'ensure_my_contact_link',
                   'profiles_remember_account', 'profiles_restore_account')
 ORDER BY proname;
