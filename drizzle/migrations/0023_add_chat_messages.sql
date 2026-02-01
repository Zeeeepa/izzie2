-- Migration: Add chat_messages table for conversation storage and semantic search
-- This table stores all chat messages with vector embeddings for semantic search,
-- enabling Izzie to recall past conversations.

-- Create the chat_messages table
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "metadata" jsonb
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "chat_messages_session_id_idx" ON "chat_messages" ("session_id");
CREATE INDEX IF NOT EXISTS "chat_messages_user_id_idx" ON "chat_messages" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_messages_role_idx" ON "chat_messages" ("role");
CREATE INDEX IF NOT EXISTS "chat_messages_created_at_idx" ON "chat_messages" ("created_at");

-- Create IVFFlat index for efficient vector similarity search
-- Using vector_cosine_ops for cosine similarity
-- Note: This index performs best with at least 1000 rows
-- For smaller datasets, a sequential scan may be faster
CREATE INDEX IF NOT EXISTS "chat_messages_embedding_idx"
ON "chat_messages"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);
