-- Migration: Add account_metadata table for multi-account support
-- Extends Better Auth accounts with labels, primary designation, and cached email
-- Enables users to connect multiple Google accounts and manage them

-- account_metadata table - extends accounts with multi-account features
CREATE TABLE IF NOT EXISTS "account_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT 'primary',
	"is_primary" boolean DEFAULT false,
	"account_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "account_metadata" ADD CONSTRAINT "account_metadata_account_id_accounts_id_fk"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "account_metadata" ADD CONSTRAINT "account_metadata_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes
CREATE INDEX IF NOT EXISTS "account_metadata_account_id_idx" ON "account_metadata" ("account_id");
CREATE INDEX IF NOT EXISTS "account_metadata_user_id_idx" ON "account_metadata" ("user_id");

-- Unique constraint to ensure one metadata record per account
CREATE UNIQUE INDEX IF NOT EXISTS "account_metadata_account_id_unique" ON "account_metadata" ("account_id");
