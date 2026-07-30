-- ============================================================================
-- FIX: besiktningsprotokoll (bilder/filer) osynliga för entreprenör + styrelse
--
-- Redan applicerad direkt via Supabase MCP 2026-07-30 — detta är referenskopian.
--
-- ROTORSAK — inte lagringsbucketen (protocols är public), utan RLS på tabellen
-- inspection_protocols:
--
--   1. Entreprenör hade ingen SELECT-policy alls. RLS ger tyst 0 rader
--      istället för ett fel, så uppladdningslistan såg bara tom ut.
--   2. Styrelsens policy använde has_property_access(), som läser den oanvända
--      property_access-tabellen (se CLAUDE.md: "finns i databasen men används
--      inte av frontend"). Alla andra styrelse-policies, t.ex. inspections
--      egen styrelse_read, går via my_property_ids() / styrelse_properties.
--      Fel tabell → alltid tom → protokollen syntes aldrig.
--
-- Admin såg bilderna hela tiden eftersom "Admin full access" är FOR ALL.
-- ============================================================================

DROP POLICY IF EXISTS "Styrelse can read protocols for their properties" ON public.inspection_protocols;

CREATE POLICY "styrelse_read_protocols" ON public.inspection_protocols
  FOR SELECT
  USING (
    is_styrelse() AND EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_protocols.inspection_id
        AND i.property_id IN (SELECT my_property_ids())
    )
  );

CREATE POLICY "entreprenor_read_protocols" ON public.inspection_protocols
  FOR SELECT
  USING (
    my_role() = 'entreprenor' AND EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_protocols.inspection_id
        AND i.assigned_contact_id = my_contact_id()
    )
  );
