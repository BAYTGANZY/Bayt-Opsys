-- Contacts created via "Lägg till entreprenör" (inline, from the Ansvarig
-- dropdown on issues/inspections/projects) have no single owning fastighet —
-- they're meant to be pickable system-wide. property_id must allow NULL.

ALTER TABLE contacts ALTER COLUMN property_id DROP NOT NULL;

-- Nothing else changes: existing property-scoped contacts keep their
-- property_id and now simply also show up in every Ansvarig dropdown,
-- system-wide, since the app no longer filters that query by property.
