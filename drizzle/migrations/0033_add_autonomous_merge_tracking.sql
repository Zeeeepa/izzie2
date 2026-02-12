-- Migration: 0033_add_autonomous_merge_tracking.sql
-- Phase 1: Autonomous merge handling for high-confidence entity merges
--
-- Adds tracking fields to merge_suggestions table:
-- - appliedAt: Timestamp when merge was actually applied
-- - appliedBy: Who applied the merge ('system_auto' or userId)
-- - Updates status to support 'auto_applied' value
--
-- Auto-apply threshold: confidence >= 0.95

-- Add new columns for auto-apply tracking
ALTER TABLE "merge_suggestions" ADD COLUMN IF NOT EXISTS "applied_at" timestamp;
ALTER TABLE "merge_suggestions" ADD COLUMN IF NOT EXISTS "applied_by" text;

-- Update status column comment to include new value
COMMENT ON COLUMN "merge_suggestions"."status" IS 'Merge status: pending | accepted | rejected | auto_applied';
COMMENT ON COLUMN "merge_suggestions"."applied_at" IS 'Timestamp when merge was actually applied to Weaviate';
COMMENT ON COLUMN "merge_suggestions"."applied_by" IS 'Who applied the merge: system_auto (for auto-applied) or userId (for manual)';

SELECT 'Migration 0033: Added autonomous merge tracking fields' AS status;
