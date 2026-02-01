-- Add Separate Budgets for Discovery and Training
-- Migration: 0026_add_separate_budgets
--
-- This migration adds separate budget columns for discovery vs training operations:
-- - discovery_budget_total / discovery_budget_used: For processing emails/calendar
-- - training_budget_total / training_budget_used: For RLHF/user feedback training

-- Add new columns with defaults (existing budget_total/budget_used will be preserved for backward compatibility)
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "discovery_budget_total" integer NOT NULL DEFAULT 500;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "discovery_budget_used" integer NOT NULL DEFAULT 0;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "training_budget_total" integer NOT NULL DEFAULT 500;
ALTER TABLE "training_sessions" ADD COLUMN IF NOT EXISTS "training_budget_used" integer NOT NULL DEFAULT 0;

-- Migrate existing data: copy budget_total/budget_used to discovery columns
UPDATE "training_sessions"
SET
  "discovery_budget_total" = "budget_total",
  "discovery_budget_used" = "budget_used"
WHERE "budget_total" IS NOT NULL;
