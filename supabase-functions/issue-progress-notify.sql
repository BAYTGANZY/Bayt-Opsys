-- Fires the "notify-progress" edge function whenever a felanmälan crosses
-- one of the four /arendestatus milestones, so the resident gets a fresh
-- email per step instead of having to keep checking the tracker page.
--
-- Run by hand in the Supabase SQL editor (or via MCP), like the rest of
-- supabase-functions/*.sql. Requires pg_net (enabled separately, migration
-- "enable_pg_net") and a Vault secret named 'notify_progress_trigger_secret'
-- — created once via `select vault.create_secret(...)`, NOT stored here, so
-- the actual value never lands in this git-tracked file. The same value
-- must be set as the NOTIFY_TRIGGER_SECRET Edge Function secret (Supabase
-- Dashboard → Edge Functions → Secrets) — that's what notify-progress
-- checks the request against, so nobody but this trigger can invoke it.

-- Mirrors computeStepIndex() in src/routes/arendestatus.tsx and the CLOSED_
-- STATUSES set in supabase-functions/track-felanmalan.ts — all three must
-- stay in sync, same reasoning as normalizeTrappa()'s duplicate. -1 means
-- "nothing has happened yet", distinct from the frontend's display default
-- of 0, so that a first viewed_at write is still detected as forward progress.
CREATE OR REPLACE FUNCTION issue_progress_step(
  p_viewed_at timestamptz,
  p_assigned_contact_id uuid,
  p_deadline date,
  p_status text
) RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('stangd', 'avslutat', 'klar', 'fakturerad') THEN 3
    WHEN p_deadline IS NOT NULL THEN 2
    WHEN p_assigned_contact_id IS NOT NULL THEN 1
    WHEN p_viewed_at IS NOT NULL THEN 0
    ELSE -1
  END;
$$;

CREATE OR REPLACE FUNCTION issue_progress_notify() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_step int;
  new_step int;
  shared_secret text;
  should_notify boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A brand new felanmälan has nothing reached yet (viewed_at etc. are all
    -- still null) — this is the one-time "we got it, waiting for someone to
    -- look" confirmation, not a milestone crossing, so there's no OLD row to
    -- compare against. notify-progress recomputes the step itself either
    -- way and will correctly get -1 here, which is exactly this email.
    should_notify := NEW.reporter_email IS NOT NULL AND btrim(NEW.reporter_email) <> '';
  ELSE
    old_step := issue_progress_step(OLD.viewed_at, OLD.assigned_contact_id, OLD.deadline, OLD.status::text);
    new_step := issue_progress_step(NEW.viewed_at, NEW.assigned_contact_id, NEW.deadline, NEW.status::text);
    -- Only a forward crossing fires an email. An unrelated edit (title,
    -- description) leaves both steps equal and sends nothing; a same-update
    -- double-advance (rare — e.g. deadline and status both set at once)
    -- still sends exactly one email, for the higher step reached.
    should_notify := new_step > old_step AND NEW.reporter_email IS NOT NULL AND btrim(NEW.reporter_email) <> '';
  END IF;

  IF should_notify THEN
    SELECT decrypted_secret INTO shared_secret
    FROM vault.decrypted_secrets WHERE name = 'notify_progress_trigger_secret';

    PERFORM net.http_post(
      url := 'https://tixxacthedwaoqtjokdr.supabase.co/functions/v1/notify-progress',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-trigger-secret', coalesce(shared_secret, '')
      ),
      body := jsonb_build_object('issue_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issues_progress_notify_trigger ON issues;
CREATE TRIGGER issues_progress_notify_trigger
  AFTER INSERT OR UPDATE ON issues
  FOR EACH ROW
  EXECUTE FUNCTION issue_progress_notify();
