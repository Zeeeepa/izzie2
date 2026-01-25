# Search-Based MCP Tool Discovery Implementation Plan

**Date**: 2026-01-25
**Author**: Research Agent
**Status**: Draft
**Related**: MCP Integration, Tool Discovery, Semantic Search

---

## Executive Summary

This document outlines the implementation plan for transitioning from loading all MCP tools into context to a semantic search-based approach that discovers and injects only the most relevant tools (5-10) based on user message content. This approach mirrors Claude Code's tool discovery pattern and will significantly reduce context overhead while improving tool relevance.

---

## 1. Problem Statement

### Current Approach
The current implementation in `/src/app/api/chat/route.ts` (lines 276-287) loads **all** MCP tools into context for every chat request:

```typescript
// Current: Load ALL tools
const mcpManager = getMCPClientManager();
const mcpTools = mcpManager.getAllTools();  // Returns ALL connected tools
const mcpToolDefs = mcpTools.length > 0 ? convertMCPToolsToOpenAI(mcpTools) : [];
const chatToolDefs = getChatToolDefinitions();
const tools = [...mcpToolDefs, ...chatToolDefs];
```

### Issues
1. **Context Bloat**: As users add more MCP servers, tool definitions consume increasing context tokens
2. **Irrelevant Tools**: Most tools are irrelevant to any given user message
3. **Poor Scaling**: Adding new MCP servers degrades performance
4. **Cost**: More tokens = higher API costs

### Target State
- Load only 5-10 most relevant tools per request
- Use semantic search to match user intent to tool capabilities
- Maintain fallback to essential/core tools
- Cache frequently used tool embeddings

---

## 2. Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Chat Request Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  User        │───▶│  Chat API        │───▶│  Tool Discovery │
│  Message     │    │  Route           │    │  Service        │
└──────────────┘    └──────────────────┘    └────────┬────────┘
                                                      │
                           ┌──────────────────────────┼──────────────────────────┐
                           │                          ▼                          │
                           │    ┌─────────────────────────────────────┐         │
                           │    │         Embedding Service           │         │
                           │    │    (text-embedding-3-small)         │         │
                           │    └──────────────────┬──────────────────┘         │
                           │                       │                             │
                           │                       ▼                             │
                           │    ┌─────────────────────────────────────┐         │
                           │    │       Vector Search (pgvector)      │         │
                           │    │    mcp_tool_embeddings table        │         │
                           │    └──────────────────┬──────────────────┘         │
                           │                       │                             │
                           │    ┌──────────────────┴──────────────────┐         │
                           │    │                                      │         │
                           │    ▼                                      ▼         │
                           │ ┌──────────────┐              ┌──────────────────┐ │
                           │ │ Top-K Tools  │              │ Core Tools       │ │
                           │ │ (Semantic)   │              │ (Always Include) │ │
                           │ └──────┬───────┘              └────────┬─────────┘ │
                           │        │                               │           │
                           │        └───────────────┬───────────────┘           │
                           │                        ▼                           │
                           │         ┌─────────────────────────────┐            │
                           │         │   Merged Tool Set (5-10)    │            │
                           │         └─────────────────────────────┘            │
                           │                                                    │
                           └────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
                           ┌─────────────────────────────────────────────────────┐
                           │              LLM API Call with Relevant Tools       │
                           └─────────────────────────────────────────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         src/lib/mcp/                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐│
│  │   index.ts       │   │   types.ts       │   │   client.ts              ││
│  │   (exports)      │   │   (interfaces)   │   │   (MCPClientManager)     ││
│  └──────────────────┘   └──────────────────┘   └──────────────────────────┘│
│                                                                              │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐│
│  │   registry.ts    │   │   NEW:           │   │   NEW:                   ││
│  │   (discovery)    │   │ tool-embeddings  │   │   tool-search.ts         ││
│  └──────────────────┘   │      .ts         │   │   (search service)       ││
│                         └──────────────────┘   └──────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     NEW: tool-discovery.ts                              ││
│  │         (orchestrates embedding generation + search)                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### Tool Embedding Generation Flow (Async/Background)

```
┌─────────────────┐
│ MCP Server      │
│ Connection      │
└────────┬────────┘
         │ Server connected
         ▼
┌─────────────────┐
│ Get Server      │
│ Tools List      │
└────────┬────────┘
         │ tools[]
         ▼
┌─────────────────┐    ┌─────────────────┐
│ For Each Tool:  │───▶│ Check if        │
│                 │    │ Embedding Exists│
└─────────────────┘    └────────┬────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
           ┌───────────────┐      ┌───────────────┐
           │ Exists &      │      │ Missing or    │
           │ Up-to-date    │      │ Outdated      │
           │ → Skip        │      │ → Generate    │
           └───────────────┘      └───────┬───────┘
                                          │
                                          ▼
                                 ┌───────────────┐
                                 │ Build Rich    │
                                 │ Description   │
                                 └───────┬───────┘
                                         │
                                         ▼
                                 ┌───────────────┐
                                 │ Generate      │
                                 │ Embedding     │
                                 │ (OpenAI)      │
                                 └───────┬───────┘
                                         │
                                         ▼
                                 ┌───────────────┐
                                 │ Store in      │
                                 │ pgvector      │
                                 └───────────────┘
```

### Search Flow (Per Chat Request)

```
┌─────────────────┐
│ User Message    │
│ "search github" │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Extract Search  │
│ Query           │
│ (full message   │
│  or summary)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate Query  │
│ Embedding       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              Vector Similarity Search               │
│  SELECT * FROM mcp_tool_embeddings                  │
│  WHERE user_id = ? AND enabled = true               │
│  ORDER BY embedding <=> query_embedding             │
│  LIMIT 8                                            │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Filter by       │
│ Threshold       │
│ (similarity     │
│  > 0.3)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Merge with      │
│ Core Tools      │
│ (native chat    │
│  tools)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Deduplicate &   │
│ Limit to 10     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return Tool     │
│ Definitions     │
└─────────────────┘
```

---

## 4. Database Schema Changes

### New Table: `mcp_tool_embeddings`

```sql
-- Migration: 0024_add_mcp_tool_embeddings.sql

CREATE TABLE mcp_tool_embeddings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Foreign keys
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,

  -- Tool identification
  tool_name TEXT NOT NULL,
  tool_description TEXT,

  -- Rich description for better embeddings
  enriched_description TEXT NOT NULL,

  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding vector(1536) NOT NULL,

  -- Metadata for cache invalidation
  input_schema_hash TEXT NOT NULL,  -- Hash of inputSchema for change detection
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (user_id, server_id, tool_name)
);

-- Indexes for efficient querying
CREATE INDEX idx_mcp_tool_embeddings_user_id ON mcp_tool_embeddings(user_id);
CREATE INDEX idx_mcp_tool_embeddings_server_id ON mcp_tool_embeddings(server_id);
CREATE INDEX idx_mcp_tool_embeddings_enabled ON mcp_tool_embeddings(enabled) WHERE enabled = true;

-- Vector similarity search index (using HNSW for fast approximate nearest neighbor)
CREATE INDEX idx_mcp_tool_embeddings_vector ON mcp_tool_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Trigger for updated_at
CREATE TRIGGER update_mcp_tool_embeddings_updated_at
  BEFORE UPDATE ON mcp_tool_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Drizzle Schema Definition

```typescript
// Add to src/lib/db/schema.ts

export const mcpToolEmbeddings = pgTable('mcp_tool_embeddings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Foreign keys
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  serverId: text('server_id').notNull().references(() => mcpServers.id, { onDelete: 'cascade' }),

  // Tool identification
  toolName: text('tool_name').notNull(),
  toolDescription: text('tool_description'),

  // Rich description for embeddings
  enrichedDescription: text('enriched_description').notNull(),

  // Vector embedding
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),

  // Cache invalidation
  inputSchemaHash: text('input_schema_hash').notNull(),
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),

  // Status
  enabled: boolean('enabled').notNull().default(true),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userServerToolUnique: unique().on(table.userId, table.serverId, table.toolName),
  userIdIdx: index('idx_mcp_tool_embeddings_user_id').on(table.userId),
  serverIdIdx: index('idx_mcp_tool_embeddings_server_id').on(table.serverId),
}));

// Types
export type McpToolEmbedding = typeof mcpToolEmbeddings.$inferSelect;
export type NewMcpToolEmbedding = typeof mcpToolEmbeddings.$inferInsert;
```

---

## 5. API Design

### Tool Discovery Service API

```typescript
// src/lib/mcp/tool-discovery.ts

export interface ToolDiscoveryOptions {
  userId: string;
  query: string;
  limit?: number;              // Default: 8
  similarityThreshold?: number; // Default: 0.3
  includeCoreTools?: boolean;  // Default: true
  serverIds?: string[];        // Filter to specific servers
}

export interface DiscoveredTool {
  tool: MCPTool;
  similarity: number;
  source: 'semantic' | 'core' | 'fallback';
}

export interface ToolDiscoveryResult {
  tools: DiscoveredTool[];
  totalSearched: number;
  searchDurationMs: number;
  embeddingGenerated: boolean;
}

export class ToolDiscoveryService {
  constructor(
    private embeddingService: EmbeddingService,
    private mcpManager: MCPClientManager
  );

  /**
   * Discover relevant tools for a user query
   */
  async discoverTools(options: ToolDiscoveryOptions): Promise<ToolDiscoveryResult>;

  /**
   * Generate/update embeddings for a server's tools
   */
  async indexServerTools(userId: string, serverId: string): Promise<number>;

  /**
   * Remove embeddings for a server (on disconnect/delete)
   */
  async removeServerEmbeddings(userId: string, serverId: string): Promise<void>;

  /**
   * Refresh all tool embeddings for a user
   */
  async refreshUserToolEmbeddings(userId: string): Promise<void>;
}
```

### Tool Embeddings API

```typescript
// src/lib/mcp/tool-embeddings.ts

export interface ToolEmbeddingInput {
  userId: string;
  serverId: string;
  tool: MCPTool;
}

export interface EnrichedToolDescription {
  original: string;
  enriched: string;
  schemaHash: string;
}

export class ToolEmbeddingService {
  constructor(private embeddingService: EmbeddingService);

  /**
   * Build enriched description for better semantic matching
   */
  buildEnrichedDescription(tool: MCPTool): EnrichedToolDescription;

  /**
   * Generate and store embedding for a tool
   */
  async generateToolEmbedding(input: ToolEmbeddingInput): Promise<McpToolEmbedding>;

  /**
   * Batch generate embeddings for multiple tools
   */
  async generateToolEmbeddings(inputs: ToolEmbeddingInput[]): Promise<McpToolEmbedding[]>;

  /**
   * Check if tool embedding needs refresh
   */
  async needsRefresh(
    userId: string,
    serverId: string,
    toolName: string,
    currentSchemaHash: string
  ): Promise<boolean>;
}
```

### Tool Search API

```typescript
// src/lib/mcp/tool-search.ts

export interface ToolSearchOptions {
  userId: string;
  queryEmbedding: number[];
  limit?: number;
  similarityThreshold?: number;
  serverIds?: string[];
}

export interface ToolSearchResult {
  toolName: string;
  serverId: string;
  similarity: number;
  enrichedDescription: string;
}

export class ToolSearchService {
  /**
   * Search for similar tools using vector similarity
   */
  async searchTools(options: ToolSearchOptions): Promise<ToolSearchResult[]>;

  /**
   * Get tool embeddings for specific tools (by name)
   */
  async getToolEmbeddings(
    userId: string,
    toolIdentifiers: Array<{ serverId: string; toolName: string }>
  ): Promise<McpToolEmbedding[]>;
}
```

### Integration with Chat Route

```typescript
// Updated src/app/api/chat/route.ts

import { ToolDiscoveryService } from '@/lib/mcp/tool-discovery';

// In chat route handler:
async function getRelevantTools(userId: string, userMessage: string): Promise<MCPTool[]> {
  const discoveryService = getToolDiscoveryService();

  const result = await discoveryService.discoverTools({
    userId,
    query: userMessage,
    limit: 8,
    similarityThreshold: 0.3,
    includeCoreTools: true,
  });

  return result.tools.map(d => d.tool);
}

// Replace current tool loading:
// OLD: const mcpTools = mcpManager.getAllTools();
// NEW: const mcpTools = await getRelevantTools(userId, lastUserMessage);
```

---

## 6. File Structure

```
src/lib/mcp/
├── index.ts                    # Updated exports
├── types.ts                    # Updated with new interfaces
├── client.ts                   # Existing MCPClientManager
├── registry.ts                 # Existing registry client
│
├── tool-embeddings.ts          # NEW: Embedding generation service
├── tool-search.ts              # NEW: Vector search service
├── tool-discovery.ts           # NEW: Main orchestration service
│
└── __tests__/                  # NEW: Tests
    ├── tool-embeddings.test.ts
    ├── tool-search.test.ts
    └── tool-discovery.test.ts

src/lib/db/
├── schema.ts                   # Updated with mcpToolEmbeddings
└── migrations/
    └── 0024_add_mcp_tool_embeddings.sql  # NEW: Migration

src/app/api/
├── chat/
│   └── route.ts                # Updated to use tool discovery
└── mcp/
    └── embeddings/
        └── route.ts            # NEW: API for manual embedding refresh
```

---

## 7. Implementation Details

### Enriched Description Generation

To improve semantic matching, tool descriptions are enriched with additional context:

```typescript
function buildEnrichedDescription(tool: MCPTool): string {
  const parts: string[] = [];

  // Tool name (cleaned)
  parts.push(`Tool: ${tool.name.replace(/_/g, ' ')}`);

  // Server context
  parts.push(`Server: ${tool.serverName}`);

  // Original description
  if (tool.description) {
    parts.push(`Description: ${tool.description}`);
  }

  // Extract parameter information
  if (tool.inputSchema?.properties) {
    const params = Object.entries(tool.inputSchema.properties as Record<string, any>)
      .map(([name, schema]) => {
        const desc = schema.description || '';
        return `${name}: ${desc}`.trim();
      })
      .filter(p => p.length > 2);

    if (params.length > 0) {
      parts.push(`Parameters: ${params.join(', ')}`);
    }
  }

  // Add capability hints based on common patterns
  const capabilities = inferCapabilities(tool.name, tool.description || '');
  if (capabilities.length > 0) {
    parts.push(`Capabilities: ${capabilities.join(', ')}`);
  }

  return parts.join('. ');
}

function inferCapabilities(name: string, description: string): string[] {
  const capabilities: string[] = [];
  const text = `${name} ${description}`.toLowerCase();

  // File operations
  if (text.includes('file') || text.includes('read') || text.includes('write')) {
    capabilities.push('file operations');
  }

  // Search/Query
  if (text.includes('search') || text.includes('query') || text.includes('find')) {
    capabilities.push('search', 'query');
  }

  // Create/Generate
  if (text.includes('create') || text.includes('generate') || text.includes('make')) {
    capabilities.push('creation', 'generation');
  }

  // ... additional patterns

  return capabilities;
}
```

### Caching Strategy

```typescript
// In-memory cache for frequently accessed embeddings
const embeddingCache = new Map<string, {
  embedding: number[];
  timestamp: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedQueryEmbedding(query: string): Promise<number[] | null> {
  const cacheKey = `query:${hashString(query)}`;
  const cached = embeddingCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.embedding;
  }

  return null;
}

async function cacheQueryEmbedding(query: string, embedding: number[]): Promise<void> {
  const cacheKey = `query:${hashString(query)}`;
  embeddingCache.set(cacheKey, {
    embedding,
    timestamp: Date.now(),
  });

  // Cleanup old entries
  if (embeddingCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of embeddingCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        embeddingCache.delete(key);
      }
    }
  }
}
```

### Fallback Mechanism

```typescript
async function discoverTools(options: ToolDiscoveryOptions): Promise<ToolDiscoveryResult> {
  const startTime = Date.now();
  let embeddingGenerated = false;

  try {
    // Try semantic search
    const queryEmbedding = await this.getOrGenerateQueryEmbedding(options.query);
    embeddingGenerated = true;

    const searchResults = await this.searchService.searchTools({
      userId: options.userId,
      queryEmbedding,
      limit: options.limit,
      similarityThreshold: options.similarityThreshold,
      serverIds: options.serverIds,
    });

    // ... process results

  } catch (error) {
    console.warn('[Tool Discovery] Semantic search failed, falling back to all tools:', error);

    // Fallback: Return all tools (current behavior)
    const allTools = this.mcpManager.getAllTools()
      .filter(t => !options.serverIds || options.serverIds.includes(t.serverId));

    return {
      tools: allTools.slice(0, options.limit || 10).map(tool => ({
        tool,
        similarity: 0,
        source: 'fallback' as const,
      })),
      totalSearched: allTools.length,
      searchDurationMs: Date.now() - startTime,
      embeddingGenerated: false,
    };
  }
}
```

---

## 8. Implementation Phases

### Phase 1: Database & Core Infrastructure (2-3 days)

**Tasks:**
1. Create database migration for `mcp_tool_embeddings` table
2. Add Drizzle schema definition
3. Run migration on development environment
4. Create `tool-embeddings.ts` with enriched description builder
5. Write unit tests for description enrichment

**Deliverables:**
- [ ] Migration file: `0024_add_mcp_tool_embeddings.sql`
- [ ] Schema update in `schema.ts`
- [ ] `src/lib/mcp/tool-embeddings.ts`
- [ ] Unit tests

### Phase 2: Embedding Generation Service (2-3 days)

**Tasks:**
1. Implement `ToolEmbeddingService` class
2. Add batch embedding generation
3. Implement schema hash for change detection
4. Hook into MCP server connection events
5. Write integration tests

**Deliverables:**
- [ ] Complete `tool-embeddings.ts` implementation
- [ ] Integration with `MCPClientManager`
- [ ] Integration tests

### Phase 3: Vector Search Service (2 days)

**Tasks:**
1. Implement `ToolSearchService` class
2. Add pgvector similarity search queries
3. Implement threshold filtering
4. Add query embedding caching
5. Write search tests

**Deliverables:**
- [ ] `src/lib/mcp/tool-search.ts`
- [ ] Search query optimization
- [ ] Performance benchmarks

### Phase 4: Discovery Orchestration (2-3 days)

**Tasks:**
1. Implement `ToolDiscoveryService` class
2. Add core tools merging logic
3. Implement fallback mechanism
4. Add deduplication and limiting
5. Write end-to-end tests

**Deliverables:**
- [ ] `src/lib/mcp/tool-discovery.ts`
- [ ] End-to-end tests
- [ ] Performance profiling

### Phase 5: Chat Route Integration (1-2 days)

**Tasks:**
1. Update chat route to use `ToolDiscoveryService`
2. Add feature flag for gradual rollout
3. Add logging and metrics
4. Test with real MCP servers
5. Document usage

**Deliverables:**
- [ ] Updated `route.ts`
- [ ] Feature flag implementation
- [ ] Monitoring dashboards

### Phase 6: Polish & Optimization (2-3 days)

**Tasks:**
1. Performance optimization
2. Cache tuning
3. Error handling improvements
4. Documentation
5. Code review and cleanup

**Deliverables:**
- [ ] Performance report
- [ ] Updated documentation
- [ ] Production readiness checklist

---

## 9. Estimated Effort

| Phase | Description | Estimated Days | Dependencies |
|-------|-------------|----------------|--------------|
| 1 | Database & Core Infrastructure | 2-3 | None |
| 2 | Embedding Generation Service | 2-3 | Phase 1 |
| 3 | Vector Search Service | 2 | Phase 1 |
| 4 | Discovery Orchestration | 2-3 | Phase 2, 3 |
| 5 | Chat Route Integration | 1-2 | Phase 4 |
| 6 | Polish & Optimization | 2-3 | Phase 5 |

**Total Estimated Effort: 11-16 developer days**

### Risk Factors

| Risk | Impact | Mitigation |
|------|--------|------------|
| Embedding API latency | Medium | Query embedding caching, async generation |
| Poor search relevance | High | Enriched descriptions, threshold tuning |
| pgvector performance | Medium | HNSW index, proper configuration |
| Breaking existing functionality | High | Feature flag, comprehensive testing |

---

## 10. Success Metrics

### Performance Metrics
- **Tool loading time**: Target < 50ms (currently can be 200ms+ with many servers)
- **Search relevance**: > 80% of top-5 tools should be genuinely relevant
- **Context reduction**: 60-80% reduction in tool definition tokens

### Quality Metrics
- **Test coverage**: > 80% for new code
- **Error rate**: < 0.1% of requests fall back to all-tools mode
- **User satisfaction**: No degradation in tool discovery accuracy

### Monitoring
- Track: search latency, embedding generation time, fallback rate
- Alert on: high fallback rate, embedding service failures
- Log: tool selection decisions for analysis

---

## 11. Future Enhancements

1. **Tool Usage Learning**: Weight search results by historical tool usage patterns
2. **Conversation Context**: Consider recent conversation for better tool prediction
3. **Server Categorization**: Group servers by capability for faster filtering
4. **Precomputed Tool Clusters**: Cluster similar tools for batch injection
5. **Adaptive Thresholds**: Per-user threshold tuning based on feedback

---

## 12. References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- Existing codebase: `/src/lib/embeddings/index.ts`, `/src/lib/db/vectors.ts`

---

## Appendix A: Example Enriched Descriptions

### Example 1: GitHub Search Tool
```
Original: "Search for GitHub repositories"

Enriched: "Tool: search repositories. Server: GitHub MCP.
Description: Search for GitHub repositories.
Parameters: query: Search query string, sort: Sort by stars/forks/updated,
order: Sort order asc/desc.
Capabilities: search, query, code discovery, repository lookup"
```

### Example 2: File Read Tool
```
Original: "Read the contents of a file"

Enriched: "Tool: read file. Server: Filesystem MCP.
Description: Read the contents of a file.
Parameters: path: File path to read, encoding: File encoding utf8/binary.
Capabilities: file operations, read, content retrieval"
```

---

## Appendix B: SQL Query Examples

### Search for Similar Tools
```sql
SELECT
  te.tool_name,
  te.server_id,
  te.enriched_description,
  1 - (te.embedding <=> $1::vector) as similarity
FROM mcp_tool_embeddings te
INNER JOIN mcp_servers ms ON te.server_id = ms.id
WHERE te.user_id = $2
  AND te.enabled = true
  AND ms.enabled = true
  AND 1 - (te.embedding <=> $1::vector) > $3  -- threshold
ORDER BY te.embedding <=> $1::vector
LIMIT $4;
```

### Batch Upsert Tool Embeddings
```sql
INSERT INTO mcp_tool_embeddings
  (id, user_id, server_id, tool_name, tool_description,
   enriched_description, embedding, input_schema_hash, embedding_model)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (user_id, server_id, tool_name)
DO UPDATE SET
  tool_description = EXCLUDED.tool_description,
  enriched_description = EXCLUDED.enriched_description,
  embedding = EXCLUDED.embedding,
  input_schema_hash = EXCLUDED.input_schema_hash,
  updated_at = NOW()
WHERE mcp_tool_embeddings.input_schema_hash != EXCLUDED.input_schema_hash;
```

---

*End of Implementation Plan*
