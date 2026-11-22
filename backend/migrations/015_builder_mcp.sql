-- Existing sessions remain tool-free until their owner creates a new consenting session.
ALTER TABLE builder_chat_sessions ADD COLUMN consent_to_mcp boolean NOT NULL DEFAULT false;
