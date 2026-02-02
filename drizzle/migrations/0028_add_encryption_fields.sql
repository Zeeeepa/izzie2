-- Add Per-User Encryption Fields
-- Migration: 0028_add_encryption_fields
-- Description: Add fields to users table for user-managed encryption with passphrases

-- Add encryption fields to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encryption_key_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encryption_salt" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passphrase_hint" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encryption_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encryption_failed_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encryption_locked_until" timestamp;

-- Add comment explaining the encryption fields
COMMENT ON COLUMN "users"."encryption_key_hash" IS 'Argon2id hash of derived key for passphrase verification';
COMMENT ON COLUMN "users"."encryption_salt" IS 'Unique base64-encoded salt for key derivation (16 bytes)';
COMMENT ON COLUMN "users"."passphrase_hint" IS 'Optional user-provided hint to remember passphrase';
COMMENT ON COLUMN "users"."encryption_enabled" IS 'Whether user has enabled data encryption';
COMMENT ON COLUMN "users"."encryption_failed_attempts" IS 'Count of failed passphrase attempts';
COMMENT ON COLUMN "users"."encryption_locked_until" IS 'Timestamp until which account is locked after max failed attempts';
