-- Makes trappa mandatory at the database level.
--
-- Follow-up to apartment-trappa-identity.sql, which widened apartment identity
-- to (property_id, apartment_number, trappa) but left trappa nullable — so the
-- admin forms could still save an apartment with no stairwell, and Postgres
-- treats NULL as distinct from every other NULL, silently defeating the unique
-- index for exactly those rows. The client side is now fixed (every apartment
-- form requires trappa); this closes the same hole in the database.
--
-- Run by hand in the Supabase SQL editor, step by step, in order.
-- Not part of the Vite build.


-- ---------------------------------------------------------------------------
-- 0. PREREQUISITE CHECK — READ-ONLY.
--    apartment-trappa-identity.sql must already have been run. This should
--    return exactly one row, named apartments_property_number_trappa_uidx.
--    If it returns the old apartments_property_number_uidx instead (or nothing),
--    stop and run apartment-trappa-identity.sql first.
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'apartments' AND indexname LIKE 'apartments_property_number%';


-- ---------------------------------------------------------------------------
-- 1. AUDIT — READ-ONLY. Lists every apartment that cannot currently be matched
--    by the /felanmalan public form because it has no stairwell recorded.
--    These are legacy rows created before trappa became required.
--    Fill them in via the admin UI (they show as "Saknas" in the Trappa column
--    on the property page) or with a targeted UPDATE, before step 4.
-- ---------------------------------------------------------------------------
SELECT a.id, p.name AS fastighet, a.apartment_number, a.trappa, a.created_at
FROM apartments a
LEFT JOIN properties p ON p.id = a.property_id
WHERE a.trappa IS NULL OR btrim(a.trappa) = ''
ORDER BY p.name, a.apartment_number;


-- ---------------------------------------------------------------------------
-- 2a. PRE-CHECK — READ-ONLY. Run this FIRST.
--     Stairwells are always letters, never numbers, so normalizeTrappa() strips
--     digits. Any existing row whose trappa is nothing but digits/punctuation
--     would therefore normalize to the empty string — i.e. step 2b would erase
--     it rather than clean it. This lists exactly those rows.
--     If it returns anything, fix those apartments by hand (set the real
--     letter) BEFORE running 2b. If it returns zero rows, 2b is safe.
-- ---------------------------------------------------------------------------
SELECT a.id, p.name AS fastighet, a.apartment_number, a.trappa AS trappa_som_forsvinner
FROM apartments a
LEFT JOIN properties p ON p.id = a.property_id
WHERE a.trappa IS NOT NULL
  AND btrim(a.trappa) <> ''
  AND regexp_replace(a.trappa, '[^a-zA-ZåäöÅÄÖ]', '', 'g') = ''
ORDER BY p.name, a.apartment_number;


-- ---------------------------------------------------------------------------
-- 2b. Normalize existing values to match normalizeTrappa() in
--     src/lib/apartment-tokens.ts (LETTERS only, uppercased). Without this,
--     a legacy "Tr. A" never equals the "A" a resident types.
--     Re-runnable. Only run once 2a returns zero rows.
-- ---------------------------------------------------------------------------
UPDATE apartments
SET trappa = upper(regexp_replace(trappa, '[^a-zA-ZåäöÅÄÖ]', '', 'g'))
WHERE trappa IS NOT NULL
  AND trappa <> upper(regexp_replace(trappa, '[^a-zA-ZåäöÅÄÖ]', '', 'g'));

-- Step 2b can merge two rows into the same identity (e.g. "Tr. A" and "A" in
-- the same property with the same number). If the UPDATE above fails on
-- apartments_property_number_trappa_uidx, resolve those duplicates by hand
-- (merge the units, then delete the redundant row) and re-run it.


-- ---------------------------------------------------------------------------
-- 3. NOT NULL. '' is the "no stairwell recorded" sentinel for legacy rows —
--    it still participates in the unique index, unlike NULL.
-- ---------------------------------------------------------------------------
UPDATE apartments SET trappa = '' WHERE trappa IS NULL;

ALTER TABLE apartments ALTER COLUMN trappa SET DEFAULT '';
ALTER TABLE apartments ALTER COLUMN trappa SET NOT NULL;


-- ---------------------------------------------------------------------------
-- 4. FINAL LOCK — run this ONLY once step 1 returns zero rows.
--    Rejects blank stairwells outright, so no future write path (SQL editor,
--    an import script, a new form someone adds later) can recreate the hole.
--    NOT VALID + VALIDATE keeps the table readable while it checks.
--
--    APPLIED 2026-07-27. Steps 1-4 are all run; the one legacy blank row
--    (lgh 201, Fastighet A) was given a stairwell first. Verified afterwards:
--    zero rows with a blank trappa. Nothing below needs running again.
-- ---------------------------------------------------------------------------
ALTER TABLE apartments
  ADD CONSTRAINT apartments_trappa_not_blank CHECK (btrim(trappa) <> '') NOT VALID;
ALTER TABLE apartments VALIDATE CONSTRAINT apartments_trappa_not_blank;
