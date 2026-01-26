-- Migration: Add sent_reminders table
-- Tracks calendar reminders already sent to prevent duplicates in serverless environment

CREATE TABLE IF NOT EXISTS "sent_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_id" text NOT NULL,
  "reminder_threshold" integer NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraint to prevent duplicate reminders for same event/threshold
CREATE UNIQUE INDEX IF NOT EXISTS "sent_reminders_unique" ON "sent_reminders" ("user_id", "event_id", "reminder_threshold");

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS "sent_reminders_sent_at_idx" ON "sent_reminders" ("sent_at");
