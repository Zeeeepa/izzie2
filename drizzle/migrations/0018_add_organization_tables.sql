-- Migration: Add organization tables for two-tier knowledge architecture
-- This adds support for organizations, membership, and shared knowledge

-- Organizations table
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"owner_id" text REFERENCES "users"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Organization Members table (many-to-many)
CREATE TABLE IF NOT EXISTS "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);

-- Shared Knowledge table
CREATE TABLE IF NOT EXISTS "shared_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"visibility" text DEFAULT 'organization' NOT NULL,
	"version" text,
	"created_by" text REFERENCES "users"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for organizations
CREATE INDEX IF NOT EXISTS "organizations_slug_idx" ON "organizations" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "organizations_owner_id_idx" ON "organizations" USING btree ("owner_id");

-- Indexes for organization_members
CREATE UNIQUE INDEX IF NOT EXISTS "org_member_unique" ON "organization_members" USING btree ("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "organization_members_org_id_idx" ON "organization_members" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_members_user_id_idx" ON "organization_members" USING btree ("user_id");

-- Indexes for shared_knowledge
CREATE INDEX IF NOT EXISTS "shared_knowledge_org_idx" ON "shared_knowledge" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "shared_knowledge_type_idx" ON "shared_knowledge" USING btree ("type");
CREATE INDEX IF NOT EXISTS "shared_knowledge_visibility_idx" ON "shared_knowledge" USING btree ("visibility");
CREATE INDEX IF NOT EXISTS "shared_knowledge_created_by_idx" ON "shared_knowledge" USING btree ("created_by");
