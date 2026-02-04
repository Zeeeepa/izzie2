-- Migration: 0031_add_entity_resolution.sql
-- Phase 1 Entity Resolution: Adds merge_suggestions table for human-in-the-loop entity merging

CREATE TABLE IF NOT EXISTS "merge_suggestions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entity1_type" text NOT NULL,
  "entity1_value" text NOT NULL,
  "entity2_type" text NOT NULL,
  "entity2_value" text NOT NULL,
  "confidence" real NOT NULL,
  "match_reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS "merge_suggestions_user_id_idx" ON "merge_suggestions" ("user_id");
CREATE INDEX IF NOT EXISTS "merge_suggestions_status_idx" ON "merge_suggestions" ("status");
CREATE INDEX IF NOT EXISTS "merge_suggestions_confidence_idx" ON "merge_suggestions" ("confidence");
CREATE INDEX IF NOT EXISTS "merge_suggestions_created_at_idx" ON "merge_suggestions" ("created_at");
