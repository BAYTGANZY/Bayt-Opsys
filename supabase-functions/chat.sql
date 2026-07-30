-- Chatt: in-portal messaging between admin/styrelse/entreprenör.
-- Role rules (client spec 2026-07-23):
--   admin      — can message anyone 1:1, and is the only role that can start a group.
--   styrelse   — can only ever have a direct conversation with an admin.
--   entreprenor — same as styrelse for starting new chats, but can also be added
--                 to any group an admin creates.
-- Participants are profiles.id (real logins), not contacts rows — a contacts row
-- without profile_id can't open the app to read a message anyway.

-- Checked 2026-07-25 against the live DB: profiles already has
--   Admin can manage all profiles (ALL, is_admin())
--   Admin can read all profiles  (SELECT, is_admin())
--   Users can read own profile   (SELECT, id = auth.uid())
--   Users can update own profile (UPDATE, id = auth.uid())
-- None collide by name with profiles_select_for_chat below, and admins are
-- already covered by is_admin() — so that policy only needs to widen reads for
-- styrelse/entreprenör, and only as far as chat actually renders.
--
-- Safe to re-run in full.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  name TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_participants (
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON chat_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS chat_participants_profile_idx
  ON chat_participants (profile_id);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Membership tests MUST go through SECURITY DEFINER helpers, never a bare
-- subquery on chat_participants. A policy on chat_participants that itself
-- selects from chat_participants re-enters its own policy and Postgres aborts
-- with 42P17 "infinite recursion detected in policy for relation". Same trap
-- applies to the conversations/messages policies, which read the same table.
-- Same pattern as the existing is_admin() helper these tables' siblings use.
CREATE OR REPLACE FUNCTION public.is_chat_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conversation_id
      AND profile_id = auth.uid()
  );
$$;

-- "Is this profile someone I already share a conversation with?" — backs the
-- profiles read policy without widening it to the whole table.
CREATE OR REPLACE FUNCTION public.shares_chat_with(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_participants mine
    JOIN chat_participants theirs ON theirs.conversation_id = mine.conversation_id
    WHERE mine.profile_id = auth.uid()
      AND theirs.profile_id = p_profile_id
  );
$$;

DROP POLICY IF EXISTS chat_conversations_select ON chat_conversations;
CREATE POLICY chat_conversations_select ON chat_conversations
  FOR SELECT USING (is_chat_participant(id));

-- You may see the participant rows of a conversation you're in (needed to
-- render co-participants' names/avatars and read-receipt ticks).
DROP POLICY IF EXISTS chat_participants_select ON chat_participants;
CREATE POLICY chat_participants_select ON chat_participants
  FOR SELECT USING (is_chat_participant(conversation_id));

-- Only your own row (bumping last_read_at for read receipts).
DROP POLICY IF EXISTS chat_participants_update_own ON chat_participants;
CREATE POLICY chat_participants_update_own ON chat_participants
  FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT USING (is_chat_participant(conversation_id));

-- Insert-only over the REST API — no UPDATE/DELETE policy on purpose. Deleting
-- is possible, but only through delete_chat_message() (SECURITY DEFINER, see
-- chat-message-delete.sql), which owns the admin-vs-tombstone rule.
DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND is_chat_participant(conversation_id)
  );

-- Chat needs non-admins to read *some* other profiles, but profiles carries
-- email and phone — so scope it to exactly what the UI renders rather than
-- opening the whole table to every authenticated user:
--   role = 'admin'  -> the picker, which non-admins filter to admins anyway
--   shares_chat_with -> co-participants in conversations you're already in
-- Admins are unaffected; "Admin can read all profiles" (is_admin()) still wins.
DROP POLICY IF EXISTS profiles_select_for_chat ON profiles;
CREATE POLICY profiles_select_for_chat ON profiles
  FOR SELECT USING (
    profiles.role = 'admin'
    OR profiles.id = auth.uid()
    OR shares_chat_with(profiles.id)
  );

-- Central place for the "who can start what" business rule, so it isn't
-- scattered across RLS policies that can only check row ownership.
CREATE OR REPLACE FUNCTION create_chat_conversation(
  p_participant_ids UUID[],
  p_is_group BOOLEAN,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  new_conv_id UUID;
  existing_id UUID;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  IF p_is_group AND caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can create group conversations';
  END IF;

  IF NOT p_is_group THEN
    IF array_length(p_participant_ids, 1) <> 1 THEN
      RAISE EXCEPTION 'Direct conversation needs exactly one other participant';
    END IF;

    IF caller_role IN ('styrelse', 'entreprenor') THEN
      IF (SELECT role FROM profiles WHERE id = p_participant_ids[1]) <> 'admin' THEN
        RAISE EXCEPTION 'This role may only message admin directly';
      END IF;
    END IF;

    -- Reuse an existing direct conversation between the same two people
    -- instead of creating a duplicate every time "New conversation" is used.
    SELECT c.id INTO existing_id
    FROM chat_conversations c
    WHERE c.type = 'direct'
      AND EXISTS (SELECT 1 FROM chat_participants WHERE conversation_id = c.id AND profile_id = auth.uid())
      AND EXISTS (SELECT 1 FROM chat_participants WHERE conversation_id = c.id AND profile_id = p_participant_ids[1])
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RETURN existing_id;
    END IF;
  END IF;

  INSERT INTO chat_conversations (type, name, created_by)
  VALUES (CASE WHEN p_is_group THEN 'group' ELSE 'direct' END, p_name, auth.uid())
  RETURNING id INTO new_conv_id;

  INSERT INTO chat_participants (conversation_id, profile_id)
  SELECT new_conv_id, x FROM unnest(array_append(p_participant_ids, auth.uid())) AS x;

  RETURN new_conv_id;
END;
$$;

-- First Realtime usage in this app — needed so messages and read-receipt
-- updates push live to open conversations.
-- Guarded per-table: a bare ALTER PUBLICATION errors with "relation is already
-- member of publication" on re-run, which would break re-running this file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_participants;
  END IF;
END
$$;