-- Entreprenörer must disappear from the Ansvarig-dropdownen (felanmälan,
-- besiktning, projekt) when they're removed from systemet — but the contacts
-- row itself must stay. Every gammalt ärende they were ansvarig for still
-- points at it via assigned_contact_id, and the logs have to keep showing who
-- did the job. A hard delete would clear that and lose the historiken.
--
-- So: retire the contact instead of deleting it.
--
-- Run this ONCE in the Supabase SQL editor BEFORE deploying the frontend build
-- that goes with it.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN contacts.active IS
  'false = pensionerad/borttagen kontakt. Visas inte i Ansvarig-dropdownen, men behålls så att gamla ärenden fortfarande visar vem som var ansvarig.';

-- The dropdown only ever reads the aktiva entreprenörerna.
CREATE INDEX IF NOT EXISTS contacts_active_entreprenor_idx
  ON contacts (contact_type, full_name)
  WHERE active;

-- ---------------------------------------------------------------------------
-- Backfill — entreprenörer whose login was deleted BEFORE this fix existed.
-- Deleting a user in Inställningar → Användare only removed the profiles row;
-- the contacts row was left behind and still shows up in every dropdown.
-- ---------------------------------------------------------------------------

-- 1. Provably orphaned: profile_id points at a profile that no longer exists.
UPDATE contacts c
   SET active = false
 WHERE c.contact_type = 'entreprenor'
   AND c.profile_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = c.profile_id);

-- 2. Review by hand. If the FK on contacts.profile_id is ON DELETE SET NULL,
--    the link was already wiped when the user was deleted — those orphans are
--    indistinguishable from contacts created inline via "+ Lägg till
--    entreprenör" (which never had a login). List them, then deactivate the
--    dead ones in the UI: Kontakter → kontakten → Status: Inaktiv.
--
-- SELECT id, full_name, company, email, created_at
--   FROM contacts
--  WHERE contact_type = 'entreprenor'
--    AND profile_id IS NULL
--    AND active
--  ORDER BY created_at DESC;
