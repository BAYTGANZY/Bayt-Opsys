-- ============================================================================
-- Client decision (2026-08-07): on the Nytt-objekt form, Typ is the only
-- required field (a searchable free-text combobox — see
-- property-objects-freeform-type-and-projects.sql). Titel (the "name" column)
-- became optional in the same pass — an objekt can be identified by its typ
-- alone. Beskrivning is a new optional free-text field.
--
-- UI: objectTypeLabel(obj.type) is the fallback wherever obj.name/Titel is
-- shown and blank — src/routes/_authenticated.properties.$id.objects*.tsx and
-- the "Kopplade objekt" list on the apartment page.
--
-- Applied directly to the live DB via Supabase MCP on 2026-08-07. Reference
-- copy, same convention as the rest of supabase-functions/. Safe to re-run.
-- ============================================================================

ALTER TABLE public.property_objects ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.property_objects ADD COLUMN IF NOT EXISTS description text;
