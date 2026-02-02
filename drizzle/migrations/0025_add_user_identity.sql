-- Add User Identity tables
-- Migration: 0025_add_user_identity
-- This adds tables for user identity management, allowing entities to be linked to the user

-- User Identity table - the user's primary identity record
CREATE TABLE IF NOT EXISTS "user_identity" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "display_name" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for user_identity
CREATE INDEX IF NOT EXISTS "user_identity_user_id_idx" ON "user_identity" ("user_id");

-- Identity Entities table - links entities (email, phone, name, company, title) to user identity
CREATE TABLE IF NOT EXISTS "identity_entities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "identity_id" text NOT NULL REFERENCES "user_identity"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_value" text NOT NULL,
  "is_primary" boolean DEFAULT FALSE NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for identity_entities
CREATE INDEX IF NOT EXISTS "identity_entities_user_id_idx" ON "identity_entities" ("user_id");
CREATE INDEX IF NOT EXISTS "identity_entities_identity_id_idx" ON "identity_entities" ("identity_id");
CREATE INDEX IF NOT EXISTS "identity_entities_entity_type_idx" ON "identity_entities" ("entity_type");

-- Unique constraint: one entity value per user/type combination
CREATE UNIQUE INDEX IF NOT EXISTS "identity_entities_user_type_value_unique" ON "identity_entities" ("user_id", "entity_type", "entity_value");
