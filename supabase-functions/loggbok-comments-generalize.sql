-- The property Loggbok page will now show the merged timeline (completed
-- besiktningar + projekt + loggbok entries) instead of a plain notes list,
-- and lets anyone comment on any event in it. logbook_comments currently
-- only supports commenting on a real logbook_entries row — this generalizes
-- it to also support besiktning/projekt items, which aren't logbook rows.

ALTER TABLE logbook_comments ALTER COLUMN logbook_entry_id DROP NOT NULL;
ALTER TABLE logbook_comments ADD COLUMN IF NOT EXISTS event_key TEXT;

-- Exactly one target must be set: a real logbook entry, or a synthetic
-- event key (e.g. "i-<inspection_id>" / "p-<project_id>").
ALTER TABLE logbook_comments DROP CONSTRAINT IF EXISTS logbook_comments_one_target;
ALTER TABLE logbook_comments ADD CONSTRAINT logbook_comments_one_target CHECK (
  (logbook_entry_id IS NOT NULL AND event_key IS NULL) OR
  (logbook_entry_id IS NULL AND event_key IS NOT NULL)
);
