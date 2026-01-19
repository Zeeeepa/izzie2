-- Migration: Add chat_sessions table for POC-6
-- Tracks chat sessions with compression and current task management

CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"current_task" jsonb,
	"compressed_history" text,
	"recent_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_messages" jsonb,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes
CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_created_at_idx" ON "chat_sessions" ("created_at");
CREATE INDEX IF NOT EXISTS "chat_sessions_updated_at_idx" ON "chat_sessions" ("updated_at");
