-- Migration: Drop deprecated digest tables
-- The daily digest feature has been deprecated (#33)
-- This migration removes digest_preferences and digest_records tables

-- Drop indexes first
DROP INDEX IF EXISTS "digest_records_user_generated_idx";
DROP INDEX IF EXISTS "digest_records_generated_at_idx";
DROP INDEX IF EXISTS "digest_records_digest_type_idx";
DROP INDEX IF EXISTS "digest_records_user_id_idx";
DROP INDEX IF EXISTS "digest_preferences_enabled_idx";
DROP INDEX IF EXISTS "digest_preferences_user_id_idx";

-- Drop tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS "digest_records" CASCADE;
DROP TABLE IF EXISTS "digest_preferences" CASCADE;
