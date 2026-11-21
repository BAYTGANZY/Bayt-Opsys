-- Teknik: markering "Åtgärd krävs" per punkt i en genomgång
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
--
-- Styrelsens vy av Teknik (Fastighetspresentation → Teknik) lyfter de punkter som markerats
-- "Åtgärd krävs" och döljer alla obockade punkter. Markeringen sätts på /teknik, på varje rad
-- i genomgången, och sparas här. Anteckningen (note) är fortfarande fri text; det är den här
-- kolumnen som avgör vad som lyfts, inte orden i anteckningen.
--
-- Utan kolumnen fungerar sidorna fortfarande (de läser select("*")), men inget lyfts förrän
-- den finns, och markeringsknappen på /teknik ger ett felmeddelande.
-- ---------------------------------------------------------------------------

alter table public.teknik_checks
  add column if not exists action_required boolean not null default false;

-- Redan skrivna anteckningar som låter som en åtgärd markeras en gång, så att sidan ser likadan ut
-- före och efter att den här filen körts. Samma ordlista som ACTION_WORDS i fastighetspresentation.tsx.
-- Ni justerar sedan själva med knappen "Åtgärd krävs" på /teknik (t.ex. en anteckning som egentligen
-- bara är information).
update public.teknik_checks
   set action_required = true
 where action_required = false
   and note is not null
   and (note ilike '%åtgärd krävs%' or note ilike '%bör åtgärdas%' or note ilike '%ej godkänd%'
        or note ilike '%saknar%' or note ~* '\mbör\M' or note ilike '%krånglar%');
