-- Migration: Add Telegram integration tables
-- Links Telegram accounts to users and maps chat sessions

-- telegram_links table - links Telegram accounts to users
-- Each user can have one Telegram account linked
CREATE TABLE IF NOT EXISTS "telegram_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"telegram_chat_id" bigint NOT NULL UNIQUE,
	"telegram_username" text,
	"linked_at" timestamp DEFAULT now() NOT NULL
);

-- telegram_link_codes table - temporary codes for linking accounts
-- Codes expire after a short time and can only be used once
CREATE TABLE IF NOT EXISTS "telegram_link_codes" (
	"code" varchar(6) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);

-- telegram_sessions table - maps Telegram chats to izzie sessions
-- Links a Telegram conversation to a chat session for context continuity
CREATE TABLE IF NOT EXISTS "telegram_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" bigint NOT NULL UNIQUE,
	"chat_session_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "telegram_sessions" ADD CONSTRAINT "telegram_sessions_chat_session_id_chat_sessions_id_fk"
FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for telegram_links
CREATE INDEX IF NOT EXISTS "telegram_links_user_id_idx" ON "telegram_links" ("user_id");
CREATE INDEX IF NOT EXISTS "telegram_links_telegram_chat_id_idx" ON "telegram_links" ("telegram_chat_id");

-- Create indexes for telegram_link_codes
CREATE INDEX IF NOT EXISTS "telegram_link_codes_user_id_idx" ON "telegram_link_codes" ("user_id");
CREATE INDEX IF NOT EXISTS "telegram_link_codes_expires_at_idx" ON "telegram_link_codes" ("expires_at");

-- Create indexes for telegram_sessions
CREATE INDEX IF NOT EXISTS "telegram_sessions_telegram_chat_id_idx" ON "telegram_sessions" ("telegram_chat_id");
CREATE INDEX IF NOT EXISTS "telegram_sessions_chat_session_id_idx" ON "telegram_sessions" ("chat_session_id");
