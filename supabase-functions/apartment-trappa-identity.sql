-- Widens apartment identity from (property_id, apartment_number) to
-- (property_id, apartment_number, trappa). Apartment numbers repeat across
-- stairwells in this portfolio (e.g. stairwell A's "1102" and stairwell B's
-- "1102" are different units), so apartment_number alone isn't a safe
-- connecting key for the /felanmalan public form (see submit-felanmalan.ts).
-- Supersedes the (property_id, apartment_number) index from apartment-connect.sql.
-- Run by hand in the Supabase SQL editor, in order. Not part of the Vite build.

-- 1. Backfill: Postgres unique indexes treat NULL as distinct from every other
--    NULL, so leaving trappa nullable would silently defeat the new constraint
--    for legacy rows with no stairwell recorded. Empty string becomes the
--    "no stairwell" sentinel going forward.
UPDATE apartments SET trappa = '' WHERE trappa IS NULL;

-- 2. Duplicate check — READ-ONLY. Run this and inspect the result before
--    proceeding. If it returns any rows, resolve those duplicates manually
--    (merge or renumber) before creating the unique index below, or the
--    CREATE UNIQUE INDEX in step 4 will fail.
SELECT property_id, apartment_number, trappa, count(*)
FROM apartments
GROUP BY property_id, apartment_number, trappa
HAVING count(*) > 1;

-- 3. Drop the old, too-loose index (only run once step 2 returns zero rows).
DROP INDEX IF EXISTS apartments_property_number_uidx;

-- 4. Create the new, correct index.
CREATE UNIQUE INDEX IF NOT EXISTS apartments_property_number_trappa_uidx
  ON apartments (property_id, apartment_number, trappa);
