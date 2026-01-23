-- Migration: Add Agent Framework Tables
-- Part of the Standardized Long-Running Agent Framework (#92)

-- Agent Runs table - tracks agent execution with progress
CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_name" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "items_processed" integer DEFAULT 0 NOT NULL,
  "items_total" integer,
  "output" jsonb,
  "error_message" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_runs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Agent Cursors table - tracks incremental processing state
CREATE TABLE IF NOT EXISTS "agent_cursors" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_name" text NOT NULL,
  "user_id" text NOT NULL,
  "source" text,
  "last_processed_id" text,
  "last_processed_date" timestamp,
  "checkpoint" jsonb,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_cursors_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Indexes for agent_runs
CREATE INDEX IF NOT EXISTS "agent_runs_user_status_idx" ON "agent_runs" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "agent_runs_agent_name_idx" ON "agent_runs" ("agent_name");
CREATE INDEX IF NOT EXISTS "agent_runs_created_at_idx" ON "agent_runs" ("created_at");

-- Indexes for agent_cursors
CREATE UNIQUE INDEX IF NOT EXISTS "agent_cursors_user_agent_source_unique" ON "agent_cursors" ("user_id", "agent_name", "source");
CREATE INDEX IF NOT EXISTS "agent_cursors_agent_name_idx" ON "agent_cursors" ("agent_name");
