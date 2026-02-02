-- Add LLM Usage Table
-- Migration: 0029_add_llm_usage
-- Description: Add table for tracking LLM inference calls with detailed cost tracking

-- Create llm_usage table
CREATE TABLE IF NOT EXISTS "llm_usage" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "operation_type" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "cost_usd" real NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "llm_usage_user_id_idx" ON "llm_usage" ("user_id");
CREATE INDEX IF NOT EXISTS "llm_usage_operation_type_idx" ON "llm_usage" ("operation_type");
CREATE INDEX IF NOT EXISTS "llm_usage_model_idx" ON "llm_usage" ("model");
CREATE INDEX IF NOT EXISTS "llm_usage_created_at_idx" ON "llm_usage" ("created_at");
CREATE INDEX IF NOT EXISTS "llm_usage_user_created_at_idx" ON "llm_usage" ("user_id", "created_at");

-- Add comments explaining the table
COMMENT ON TABLE "llm_usage" IS 'Tracks LLM inference calls with token counts and cost calculations';
COMMENT ON COLUMN "llm_usage"."operation_type" IS 'Type of operation: chat, extraction, training, research, agent, telegram';
COMMENT ON COLUMN "llm_usage"."model" IS 'Model identifier (e.g., claude-opus-4.5, anthropic/claude-sonnet-4)';
COMMENT ON COLUMN "llm_usage"."input_tokens" IS 'Number of input/prompt tokens';
COMMENT ON COLUMN "llm_usage"."output_tokens" IS 'Number of output/completion tokens';
COMMENT ON COLUMN "llm_usage"."cost_usd" IS 'Calculated cost in USD based on model pricing';
COMMENT ON COLUMN "llm_usage"."metadata" IS 'Optional JSON metadata for additional context';
