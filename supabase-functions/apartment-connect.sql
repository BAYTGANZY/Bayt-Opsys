-- ============================================================
-- Apartment connect-or-create for the public felanmälan survey
-- Run this in the Supabase SQL Editor BEFORE deploying the
-- updated submit-felanmalan Edge Function.
-- ============================================================

-- 1) PRIVACY: the public survey no longer lists apartments in a
--    dropdown (residents type their own number instead), so remove
--    the anon read access on apartments that would leak neighbours'
--    apartment data. (The properties read policy stays — the survey
--    still needs the building list.)
DROP POLICY IF EXISTS "Public can read apartment numbers for felanmalan form" ON apartments;

-- 2) Mark how an apartment was created, so admins can spot
--    apartments auto-created from a resident report and verify them.
ALTER TABLE apartments ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'admin';
-- values: 'admin' (created in-app) | 'public_form' (auto-created from a survey submission)

-- 3) RECOMMENDED — prevent duplicate apartments per building so
--    connect-or-create always resolves to one row.
--    First check for existing duplicates:
--
--    SELECT property_id, apartment_number, count(*)
--    FROM apartments
--    GROUP BY property_id, apartment_number
--    HAVING count(*) > 1;
--
--    If that returns NO rows, create the unique index:
CREATE UNIQUE INDEX IF NOT EXISTS apartments_property_number_uidx
  ON apartments (property_id, apartment_number);
--    (If it returns duplicates, merge/rename them first, then run the index.)
