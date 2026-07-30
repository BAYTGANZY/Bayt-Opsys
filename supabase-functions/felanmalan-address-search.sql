-- Adds `address` to the public_properties view so the /felanmalan survey can
-- fuzzy-match the resident's typed address to a building (see felanmalan.tsx).
-- The view already exists (created by hand in the Supabase dashboard) and
-- currently exposes only id + name — this just adds one column to it.
-- Run this by hand in the Supabase SQL editor; not part of the Vite build.

CREATE OR REPLACE VIEW public_properties AS
SELECT id, name, address
FROM properties;
