-- Add Entity Aliases table for deduplication support
-- Migration: 0030_add_entity_aliases

-- Entity Aliases table - stores nicknames/aliases for entities
-- Helps with deduplication by recognizing different names for the same entity
CREATE TABLE IF NOT EXISTS "entity_aliases" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,  -- 'person' | 'company' | 'project' | 'tool' | 'topic' | 'location' | 'action_item'
  "entity_value" text NOT NULL, -- Normalized entity value (canonical name)
  "alias" text NOT NULL,        -- The alias/nickname for this entity
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for entity_aliases
CREATE INDEX IF NOT EXISTS "entity_aliases_user_id_idx" ON "entity_aliases" ("user_id");
CREATE INDEX IF NOT EXISTS "entity_aliases_entity_type_idx" ON "entity_aliases" ("entity_type");
CREATE INDEX IF NOT EXISTS "entity_aliases_entity_value_idx" ON "entity_aliases" ("entity_value");
CREATE INDEX IF NOT EXISTS "entity_aliases_alias_idx" ON "entity_aliases" ("alias");

-- Unique constraint: one alias per user/entity-type combination
CREATE UNIQUE INDEX IF NOT EXISTS "entity_aliases_user_type_alias_unique" ON "entity_aliases" ("user_id", "entity_type", "alias");
