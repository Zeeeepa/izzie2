-- Migration: Add notification_history table for deduplication
-- Tracks sent notifications to prevent duplicate alerts for the same source item

-- notification_history table
CREATE TABLE IF NOT EXISTS "notification_history" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "alert_level" text NOT NULL,
  "channel" text NOT NULL,
  "delivered_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "notification_history_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "notification_history_user_id_idx" ON "notification_history" ("user_id");
CREATE INDEX IF NOT EXISTS "notification_history_source_type_idx" ON "notification_history" ("source_type");
CREATE INDEX IF NOT EXISTS "notification_history_delivered_at_idx" ON "notification_history" ("delivered_at");

-- Unique constraint to prevent duplicate notifications per user/source/channel
CREATE UNIQUE INDEX IF NOT EXISTS "notification_history_user_source_channel_unique" ON "notification_history" ("user_id", "source_id", "channel");
