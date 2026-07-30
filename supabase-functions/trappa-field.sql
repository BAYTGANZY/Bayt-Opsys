-- Trappuppgång (stairwell) as a free-text detail — not a real estate entity,
-- not a connecting/matching key like apartment_number. Just a descriptive
-- field wherever "which stairwell is this in" matters.

ALTER TABLE apartments  ADD COLUMN IF NOT EXISTS trappa TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS trappa TEXT;
-- issues.trappa already exists from an earlier migration — no change needed there.
