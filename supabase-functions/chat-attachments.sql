-- Chatt: bildbilagor (client spec 2026-08-07).
-- Lets any participant attach one image to a message, with or without text.
-- Mirrors project-files-storage-policies.sql's path-convention approach: the
-- object key's first path segment is the conversation id, so a single EXISTS
-- against chat_participants (text-compared, no uuid cast on arbitrary input)
-- both scopes uploads and lets createSignedUrls succeed for participants.
--
-- Runs on top of chat.sql, chat-message-delete.sql, chat-reply.sql. Safe to
-- re-run in full.

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- A message needs a body or an attachment, never neither — chat_messages_insert
-- (chat.sql) already checks sender_id/participancy; this is the one thing it
-- doesn't check. Postgres has no ADD CONSTRAINT ... IF NOT EXISTS, hence the DO
-- block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_body_or_attachment'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_body_or_attachment
      CHECK (body <> '' OR attachment_url IS NOT NULL);
  END IF;
END
$$;

-- Private bucket — every download in this app goes through useSignedFileUrls,
-- never a bare public URL (see src/lib/storage.ts).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-files', 'chat-files', false, 8388608, ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Client uploads to `<conversation_id>/<timestamp>-<filename>`, so the first
-- path segment IS the conversation id — same contract project-files uses for
-- project id. Compared as text on both sides (not cast to uuid) so a malformed
-- key fails the EXISTS instead of erroring the whole policy.
DROP POLICY IF EXISTS "Chat participant upload" ON storage.objects;
CREATE POLICY "Chat participant upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-files' AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id::text = (storage.foldername(name))[1]
        AND profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat participant read" ON storage.objects;
CREATE POLICY "Chat participant read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'chat-files' AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id::text = (storage.foldername(name))[1]
        AND profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin full access to chat-files" ON storage.objects;
CREATE POLICY "Admin full access to chat-files" ON storage.objects
  FOR ALL
  USING (bucket_id = 'chat-files' AND is_admin())
  WITH CHECK (bucket_id = 'chat-files' AND is_admin());

-- ---------------------------------------------------------------------------
-- VERIFY — read-only.
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'chat-files';
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%chat%'
 ORDER BY policyname;
SELECT conname FROM pg_constraint WHERE conname = 'chat_messages_body_or_attachment';
