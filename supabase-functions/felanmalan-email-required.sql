-- Backstop for the /arendestatus tracker: a resident can only look their
-- felanmälan up by reporter_email, so a public-form submission without one
-- can never be found again. The client (src/routes/felanmalan.tsx) and
-- submit-felanmalan.ts both already require it; this is the DB-level net
-- for any write path that doesn't exist yet (bulk import, hand-written
-- INSERT), same reasoning as apartments_trappa_not_blank.
--
-- NOT VALID: existing public_form rows predate this rule (reporter_email was
-- optional before) and are left alone. Only new inserts/updates are checked.
-- Applied 2026-08-26 via Supabase MCP.
ALTER TABLE issues
  ADD CONSTRAINT issues_public_form_reporter_email_required
  CHECK (
    submission_source <> 'public_form'
    OR (reporter_email IS NOT NULL AND btrim(reporter_email) <> '')
  )
  NOT VALID;
