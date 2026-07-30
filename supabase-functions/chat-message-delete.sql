-- Chatt: radera meddelande (client spec 2026-07-25).
-- Nobody may delete a message they didn't send — not even admin. The other
-- party's turns always stay in the thread; moderation is not a chat feature.
-- What differs is what a delete leaves behind:
--   admin      — hard DELETE of their own message, the row is gone and the
--                bubble vanishes for everyone, no tombstone.
--   all others — soft delete of their own message: body is scrubbed and a
--                tombstone ("Meddelandet togs bort") stays in the thread.
--
-- Runs on top of chat.sql. Safe to re-run in full.

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Realtime DELETE payloads only carry the replica-identity columns, which by
-- default is just the primary key. The client subscribes with
-- `filter: conversation_id=eq.<id>`, and that filter can never match an old row
-- that doesn't include conversation_id — so admin hard-deletes would never push
-- to other open windows. FULL ships the whole old row so the filter (and the
-- per-subscriber RLS check on DELETE) can be evaluated.
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- chat.sql deliberately gives chat_messages no UPDATE/DELETE policy, so the
-- table stays insert-only over the REST API. Deleting therefore goes through
-- this SECURITY DEFINER function, which is the single place the role rule lives
-- — same pattern as create_chat_conversation().
-- Returns 'removed' (row gone) or 'tombstoned' (body scrubbed) so the client
-- knows which local update to apply without re-fetching.
CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg chat_messages%ROWTYPE;
  caller_role TEXT;
BEGIN
  SELECT * INTO msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT is_chat_participant(msg.conversation_id) THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  -- Applies to every role. Checked before the admin branch so admin can't
  -- reach into the other party's messages.
  IF msg.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'You may only delete your own messages';
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  -- Admin: gone for good, no tombstone left in the thread.
  IF caller_role = 'admin' THEN
    DELETE FROM chat_messages WHERE id = p_message_id;
    RETURN 'removed';
  END IF;

  IF msg.deleted_at IS NOT NULL THEN
    RETURN 'tombstoned';
  END IF;

  -- Blank the body rather than only flagging it: a tombstone whose text is still
  -- readable over the REST API isn't a delete.
  UPDATE chat_messages
     SET body = '', deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_message_id;

  RETURN 'tombstoned';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_chat_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(UUID) TO authenticated;
