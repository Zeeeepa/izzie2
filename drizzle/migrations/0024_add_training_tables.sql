-- Add Training Tables
-- Migration: 0024_add_training_tables

-- Training Sessions table - tracks ML training sessions with human-in-the-loop
CREATE TABLE IF NOT EXISTS "training_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'collecting',
  "mode" text NOT NULL DEFAULT 'collect_feedback',
  "budget_total" integer NOT NULL DEFAULT 500,
  "budget_used" integer NOT NULL DEFAULT 0,
  "sample_size" integer NOT NULL DEFAULT 100,
  "auto_train_threshold" integer NOT NULL DEFAULT 50,
  "sample_types" text[] NOT NULL DEFAULT ARRAY['entity']::text[],
  "samples_collected" integer NOT NULL DEFAULT 0,
  "feedback_received" integer NOT NULL DEFAULT 0,
  "exceptions_count" integer NOT NULL DEFAULT 0,
  "accuracy" real NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

-- Training Samples table - stores samples for user feedback
CREATE TABLE IF NOT EXISTS "training_samples" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "training_sessions"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'entity',
  "content_text" text NOT NULL,
  "content_context" text,
  "source_id" text,
  "source_type" text,
  "prediction_label" text NOT NULL,
  "prediction_confidence" integer NOT NULL,
  "prediction_reasoning" text,
  "status" text NOT NULL DEFAULT 'pending',
  "feedback_is_correct" boolean,
  "feedback_corrected_label" text,
  "feedback_notes" text,
  "feedback_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Training Exceptions table - items requiring human review
CREATE TABLE IF NOT EXISTS "training_exceptions" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "training_sessions"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium',
  "title" text NOT NULL,
  "description" text NOT NULL,
  "affected_entity_id" text,
  "affected_entity_type" text,
  "context" text,
  "status" text NOT NULL DEFAULT 'pending',
  "resolution" text,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for training_sessions
CREATE INDEX IF NOT EXISTS "training_sessions_user_id_idx" ON "training_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "training_sessions_status_idx" ON "training_sessions" ("status");
CREATE INDEX IF NOT EXISTS "training_sessions_created_at_idx" ON "training_sessions" ("created_at");

-- Indexes for training_samples
CREATE INDEX IF NOT EXISTS "training_samples_session_id_idx" ON "training_samples" ("session_id");
CREATE INDEX IF NOT EXISTS "training_samples_status_idx" ON "training_samples" ("status");
CREATE INDEX IF NOT EXISTS "training_samples_type_idx" ON "training_samples" ("type");
CREATE INDEX IF NOT EXISTS "training_samples_confidence_idx" ON "training_samples" ("prediction_confidence");

-- Indexes for training_exceptions
CREATE INDEX IF NOT EXISTS "training_exceptions_session_id_idx" ON "training_exceptions" ("session_id");
CREATE INDEX IF NOT EXISTS "training_exceptions_user_id_idx" ON "training_exceptions" ("user_id");
CREATE INDEX IF NOT EXISTS "training_exceptions_status_idx" ON "training_exceptions" ("status");
CREATE INDEX IF NOT EXISTS "training_exceptions_type_idx" ON "training_exceptions" ("type");
