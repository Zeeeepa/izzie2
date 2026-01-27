-- Migration: Add usage_tracking table
-- Tracks token usage and costs per user, model, and source

CREATE TABLE IF NOT EXISTS "usage_tracking" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversation_id" text,
  "date" date NOT NULL,
  "model" text NOT NULL,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" real NOT NULL DEFAULT 0,
  "source" text,
  "created_at" timestamp DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "usage_tracking_user_id_idx" ON "usage_tracking" ("user_id");
CREATE INDEX IF NOT EXISTS "usage_tracking_date_idx" ON "usage_tracking" ("date");
CREATE INDEX IF NOT EXISTS "usage_tracking_model_idx" ON "usage_tracking" ("model");
CREATE INDEX IF NOT EXISTS "usage_tracking_source_idx" ON "usage_tracking" ("source");
CREATE INDEX IF NOT EXISTS "usage_tracking_user_date_idx" ON "usage_tracking" ("user_id", "date");
