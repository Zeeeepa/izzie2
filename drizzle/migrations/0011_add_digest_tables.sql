-- Migration: Add digest tables for scheduled digest delivery
-- User preferences for digest timing and delivery channels

-- digest_preferences table - user digest settings
-- Each user can configure their preferred digest schedule
CREATE TABLE IF NOT EXISTS "digest_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"enabled" boolean DEFAULT true NOT NULL,
	"morning_time" time DEFAULT '08:00:00' NOT NULL,
	"evening_time" time DEFAULT '18:00:00' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"channels" text[] DEFAULT ARRAY['email']::text[] NOT NULL,
	"min_relevance_score" numeric(3,2) DEFAULT 0.5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- digest_records table - digest tracking
-- Tracks generated and delivered digests for history and debugging
CREATE TABLE IF NOT EXISTS "digest_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"digest_type" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"delivery_channel" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"content" jsonb,
	"error" text
);

-- Add foreign key constraints
ALTER TABLE "digest_preferences" ADD CONSTRAINT "digest_preferences_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "digest_records" ADD CONSTRAINT "digest_records_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for digest_preferences
CREATE INDEX IF NOT EXISTS "digest_preferences_user_id_idx" ON "digest_preferences" ("user_id");
CREATE INDEX IF NOT EXISTS "digest_preferences_enabled_idx" ON "digest_preferences" ("enabled");

-- Create indexes for digest_records
CREATE INDEX IF NOT EXISTS "digest_records_user_id_idx" ON "digest_records" ("user_id");
CREATE INDEX IF NOT EXISTS "digest_records_digest_type_idx" ON "digest_records" ("digest_type");
CREATE INDEX IF NOT EXISTS "digest_records_generated_at_idx" ON "digest_records" ("generated_at");
CREATE INDEX IF NOT EXISTS "digest_records_user_generated_idx" ON "digest_records" ("user_id", "generated_at");
