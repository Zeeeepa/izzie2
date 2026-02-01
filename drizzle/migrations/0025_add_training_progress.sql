-- Add Training Progress Table
-- Migration: 0025_add_training_progress
-- Tracks which days have been processed for autonomous training

-- Training Progress table - tracks day-based processing
CREATE TABLE IF NOT EXISTS "training_progress" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" text REFERENCES "training_sessions"("id") ON DELETE SET NULL,
  "source_type" text NOT NULL,
  "processed_date" date NOT NULL,
  "items_found" integer NOT NULL DEFAULT 0,
  "processed_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for training_progress
CREATE INDEX IF NOT EXISTS "training_progress_user_id_idx" ON "training_progress" ("user_id");
CREATE INDEX IF NOT EXISTS "training_progress_session_id_idx" ON "training_progress" ("session_id");
CREATE INDEX IF NOT EXISTS "training_progress_source_type_idx" ON "training_progress" ("source_type");
CREATE INDEX IF NOT EXISTS "training_progress_processed_date_idx" ON "training_progress" ("processed_date");

-- Unique constraint: one record per user/source/date combination
CREATE UNIQUE INDEX IF NOT EXISTS "training_progress_user_source_date_unique"
  ON "training_progress" ("user_id", "source_type", "processed_date");
