-- Migration: Add extraction_progress table for POC-5
-- Tracks data extraction progress for emails, calendar, and drive

CREATE TABLE IF NOT EXISTS "extraction_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"oldest_date_extracted" timestamp,
	"newest_date_extracted" timestamp,
	"total_items" integer DEFAULT 0,
	"processed_items" integer DEFAULT 0,
	"failed_items" integer DEFAULT 0,
	"chunk_size_days" integer DEFAULT 7,
	"current_chunk_start" timestamp,
	"current_chunk_end" timestamp,
	"entities_extracted" integer DEFAULT 0,
	"total_cost" integer DEFAULT 0,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "extraction_progress" ADD CONSTRAINT "extraction_progress_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes
CREATE INDEX IF NOT EXISTS "extraction_progress_user_id_idx" ON "extraction_progress" ("user_id");
CREATE INDEX IF NOT EXISTS "extraction_progress_source_idx" ON "extraction_progress" ("source");
CREATE INDEX IF NOT EXISTS "extraction_progress_status_idx" ON "extraction_progress" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "extraction_progress_user_source_unique" ON "extraction_progress" ("user_id","source");
