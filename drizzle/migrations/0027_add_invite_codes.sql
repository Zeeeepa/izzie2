-- Add Invite Codes Table
-- Migration: 0027_add_invite_codes
-- Description: Gate new user signups with invite codes

-- Create invite_codes table
CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" varchar(50) NOT NULL UNIQUE,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "used_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "used_at" timestamp,
  "expires_at" timestamp,
  "max_uses" integer NOT NULL DEFAULT 1,
  "use_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "invite_codes_code_idx" ON "invite_codes" ("code");
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_idx" ON "invite_codes" ("created_by");

-- Seed initial invite codes
-- IZZIE-FOUNDER: Unlimited uses, no expiry (for the founder)
INSERT INTO "invite_codes" ("id", "code", "max_uses", "use_count", "created_at")
VALUES (gen_random_uuid()::text, 'IZZIE-FOUNDER', 999999, 0, now())
ON CONFLICT ("code") DO NOTHING;

-- IZZIE-BETA-001 through IZZIE-BETA-010: Single use each
INSERT INTO "invite_codes" ("id", "code", "max_uses", "use_count", "created_at")
VALUES
  (gen_random_uuid()::text, 'IZZIE-BETA-001', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-002', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-003', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-004', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-005', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-006', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-007', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-008', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-009', 1, 0, now()),
  (gen_random_uuid()::text, 'IZZIE-BETA-010', 1, 0, now())
ON CONFLICT ("code") DO NOTHING;
