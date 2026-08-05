-- Chatt: reply to a message (client spec 2026-08-05).
-- Quotes the original above the composer while composing, and as a small quoted
-- preview inside the reply bubble once sent.
--
-- reply_to_id is SET NULL on delete: an admin hard-delete removes the target row
-- entirely (see chat-message-delete.sql), and a reply to it should keep existing
-- — its own body is unaffected — but lose the dangling link. The client falls
-- back to "Borttaget meddelande" when the lookup misses. A soft-delete tombstone
-- (everyone else) keeps the row, so the reply preview renders it normally as
-- "Meddelandet togs bort".
--
-- No RLS change needed: chat_messages_insert (chat.sql) already checks
-- sender_id/is_chat_participant on the row being inserted, which covers this
-- column the same as any other. No trigger enforces reply_to_id being in the
-- same conversation — the client always sets it from a message already loaded
-- in the open thread.
--
-- Runs on top of chat.sql. Safe to re-run in full. Applied to the live DB
-- 2026-08-05 via Supabase MCP (mcp__supabase__apply_migration).

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_reply_to_idx ON chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
