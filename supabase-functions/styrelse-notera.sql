-- Styrelse får skriva noteringar i loggboken för sin egen fastighet (annars är de helt skrivskyddade).
-- Additiv: lägger till en INSERT-policy, ändrar ingen befintlig. Säker att köra om.
DROP POLICY IF EXISTS styrelse_comment ON public.logbook_entries;
CREATE POLICY styrelse_comment ON public.logbook_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    my_role() = 'styrelse'
    AND property_id IN (SELECT my_property_ids())
    AND created_by = auth.uid()
  );
