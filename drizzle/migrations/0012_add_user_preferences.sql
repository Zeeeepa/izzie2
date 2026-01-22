-- Migration: Add user_preferences table for writing style customization
-- Stores user preferences for AI writing style, tone, and custom instructions

-- user_preferences table - writing style customization
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"writing_style" text DEFAULT 'professional' NOT NULL,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"custom_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Create index for user lookup
CREATE INDEX IF NOT EXISTS "user_preferences_user_id_idx" ON "user_preferences" ("user_id");
