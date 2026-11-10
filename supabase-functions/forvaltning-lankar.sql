-- Ekonomisk förvaltning: länkar till de program/tjänster BAYT använder.
-- Kör för hand i Supabase SQL Editor. Säker att köra om.
-- Admin skriver; admin och styrelse läser. Appen tål att tabellen saknas (visar då tom sida).

CREATE TABLE IF NOT EXISTS public.forvaltning_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  url         text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.forvaltning_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forvaltning_links_select ON public.forvaltning_links;
CREATE POLICY forvaltning_links_select ON public.forvaltning_links
  FOR SELECT TO authenticated
  USING (is_admin() OR my_role() = 'styrelse');

DROP POLICY IF EXISTS forvaltning_links_write ON public.forvaltning_links;
CREATE POLICY forvaltning_links_write ON public.forvaltning_links
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Kontroll: ska visa en rad med relrowsecurity = true
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'forvaltning_links';
