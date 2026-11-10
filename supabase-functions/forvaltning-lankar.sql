-- Ekonomisk förvaltning: länkar till de program/tjänster BAYT använder.
-- Kör för hand i Supabase SQL Editor. Säker att köra om.
-- Korten hör till EN förening var (property_id) — det finns inga gemensamma kort.
-- Admin skriver; admin och styrelse läser, styrelse bara sin egen förenings kort.
-- Appen tål att tabellen saknas (visar då en notis).

CREATE TABLE IF NOT EXISTS public.forvaltning_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  url         text,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabellen skapades först utan property_id; den här raden lägger till kolumnen i en redan körd databas.
ALTER TABLE public.forvaltning_links ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS forvaltning_links_property_idx ON public.forvaltning_links (property_id, sort_order);

ALTER TABLE public.forvaltning_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forvaltning_links_select ON public.forvaltning_links;
CREATE POLICY forvaltning_links_select ON public.forvaltning_links
  FOR SELECT TO authenticated
  USING (is_admin() OR (is_styrelse() AND property_id IN (SELECT my_property_ids())));

DROP POLICY IF EXISTS forvaltning_links_write ON public.forvaltning_links;
CREATE POLICY forvaltning_links_write ON public.forvaltning_links
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Kontroll: ska visa en rad med relrowsecurity = true
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'forvaltning_links';

-- Efter att appen med property_id är ute (och alla kort är kopplade till en förening):
-- ALTER TABLE public.forvaltning_links ALTER COLUMN property_id SET NOT NULL;
