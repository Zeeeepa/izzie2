-- Migration: Add notification_queue table for persistent notification queuing
-- This table persists P2 batch and quiet hours queues across server restarts

CREATE TABLE IF NOT EXISTS "notification_queue" (
  "id" text PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "alert_level" text NOT NULL,
  "queue_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "scheduled_for" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for efficient queue operations
CREATE INDEX IF NOT EXISTS "notification_queue_user_id_idx" ON "notification_queue" ("user_id");
CREATE INDEX IF NOT EXISTS "notification_queue_queue_type_idx" ON "notification_queue" ("queue_type");
CREATE INDEX IF NOT EXISTS "notification_queue_scheduled_for_idx" ON "notification_queue" ("scheduled_for");
CREATE INDEX IF NOT EXISTS "notification_queue_user_queue_idx" ON "notification_queue" ("user_id", "queue_type");
