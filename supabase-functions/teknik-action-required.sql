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

-- Redan skrivna anteckningar som säger det rakt ut markeras en gång. Övriga ("saknar", "bör
-- bytas" osv.) lämnas orörda: de bedömer ni själva och bockar i på /teknik.
update public.teknik_checks
   set action_required = true
 where action_required = false
   and note is not null
   and (note ilike '%åtgärd krävs%' or note ilike '%bör åtgärdas%' or note ilike '%ej godkänd%');
