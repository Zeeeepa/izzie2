-- Migration: Add MCP tool embeddings table for semantic tool discovery
-- Part of Search-Based MCP Tool Discovery (Phase 1)
-- This enables semantic search over MCP tools to select relevant tools per user message

-- Create the mcp_tool_embeddings table
CREATE TABLE IF NOT EXISTS "mcp_tool_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"server_id" text NOT NULL REFERENCES "mcp_servers"("id") ON DELETE CASCADE,
	"tool_name" text NOT NULL,
	"description" text,
	"enriched_description" text NOT NULL,
	"embedding" vector(1536),
	"input_schema_hash" text NOT NULL,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Standard indexes
CREATE INDEX IF NOT EXISTS "mcp_tool_embeddings_user_id_idx" ON "mcp_tool_embeddings" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "mcp_tool_embeddings_server_id_idx" ON "mcp_tool_embeddings" USING btree ("server_id");
CREATE INDEX IF NOT EXISTS "mcp_tool_embeddings_enabled_idx" ON "mcp_tool_embeddings" USING btree ("enabled");

-- Unique constraint: one embedding per user/server/tool combination
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tool_embeddings_user_server_tool_unique" ON "mcp_tool_embeddings" USING btree ("user_id", "server_id", "tool_name");

-- HNSW index for fast approximate nearest neighbor search
-- Using vector_cosine_ops for cosine similarity (standard for text embeddings)
-- m=16: Number of bi-directional links per node (good balance of speed vs recall)
-- ef_construction=64: Size of dynamic candidate list during construction
CREATE INDEX IF NOT EXISTS "mcp_tool_embeddings_embedding_idx" ON "mcp_tool_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
