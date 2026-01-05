# Mem0 OSS Integration

Complete implementation of Mem0 OSS with persistent vector storage using pgvector (Neon Postgres).

## Architecture

The memory system integrates three components:

1. **pgvector (Neon Postgres)**: Persistent vector storage with 1536-dimensional embeddings
2. **Neo4j Graph**: Entity relationships and graph traversal
3. **Mem0**: Memory management and graph integration

```
┌─────────────────────────────────────────────────┐
│              Memory Service                      │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────┐│
│  │   pgvector   │  │    Neo4j     │  │  Mem0  ││
│  │  (Neon PG)   │  │   (Graph)    │  │ (Graph)││
│  │              │  │              │  │        ││
│  │  Persistent  │  │  Entities &  │  │ Memory ││
│  │   Vectors    │  │ Relationships│  │  Mgmt  ││
│  └──────────────┘  └──────────────┘  └────────┘│
└─────────────────────────────────────────────────┘
```

## Features

### Vector Storage (pgvector)
- **Persistent embeddings**: Survive server restarts
- **OpenAI embeddings**: text-embedding-3-small (1536 dimensions)
- **Semantic search**: Cosine similarity with configurable threshold
- **Metadata support**: Store additional context with each memory
- **Access tracking**: Track usage frequency and last access time
- **Soft delete**: Mark memories as deleted without permanent removal

### Hybrid Search
- **Vector search**: Find semantically similar memories
- **Graph traversal**: Discover related entities via Neo4j
- **Combined results**: Merge vector and graph results intelligently
- **User isolation**: Memories scoped to individual users

### Memory Management
- **Store**: Add new memories with automatic embedding generation
- **Retrieve**: Search by semantic similarity
- **Get by ID**: Retrieve specific memory with access tracking
- **Get all**: List all memories for a user
- **Stats**: Usage statistics (count, importance, access frequency)
- **Delete**: Soft or hard delete

## API Endpoints

### POST /api/memory/store
Store a new memory with vector embedding.

**Request:**
```json
{
  "userId": "user-123",
  "content": "User prefers dark mode for the UI",
  "metadata": {
    "source": "conversation",
    "type": "preference"
  },
  "conversationId": "conv-456",
  "importance": 8,
  "summary": "UI preference"
}
```

**Response:**
```json
{
  "status": "success",
  "memory": {
    "id": "mem-abc123",
    "userId": "user-123",
    "content": "User prefers dark mode for the UI",
    "metadata": {
      "source": "conversation",
      "type": "preference"
    },
    "createdAt": "2025-01-05T10:00:00.000Z"
  },
  "message": "Memory stored successfully"
}
```

### GET /api/memory/search
Search memories using semantic similarity.

**Query Parameters:**
- `userId` (required): User ID
- `query` (required): Search query
- `limit` (optional): Max results (default: 10)
- `threshold` (optional): Similarity threshold 0-1 (default: 0.7)
- `conversationId` (optional): Filter by conversation
- `minImportance` (optional): Minimum importance (default: 1)
- `includeGraph` (optional): Include graph results (default: false)

**Example:**
```
GET /api/memory/search?userId=user-123&query=UI%20preferences&limit=5&threshold=0.8
```

**Response:**
```json
{
  "status": "success",
  "memories": [
    {
      "id": "mem-abc123",
      "userId": "user-123",
      "content": "User prefers dark mode for the UI",
      "metadata": {
        "similarity": 0.92,
        "importance": 8,
        "accessCount": 3
      },
      "createdAt": "2025-01-05T10:00:00.000Z"
    }
  ],
  "count": 1,
  "query": "UI preferences",
  "options": {
    "limit": 5,
    "threshold": 0.8
  }
}
```

### GET /api/memory/retrieve
Retrieve memory by ID or get all for a user.

**By ID:**
```
GET /api/memory/retrieve?memoryId=mem-abc123
```

**All for user:**
```
GET /api/memory/retrieve?userId=user-123&limit=100
```

**Response (all for user):**
```json
{
  "status": "success",
  "memories": [...],
  "count": 15,
  "stats": {
    "total": 15,
    "byConversation": {
      "conv-456": 5,
      "conv-789": 10
    },
    "avgImportance": 6.2,
    "totalAccesses": 47
  }
}
```

### DELETE /api/memory/retrieve
Delete a memory.

**Query Parameters:**
- `memoryId` (required): Memory ID
- `hard` (optional): Hard delete (default: false)

**Example:**
```
DELETE /api/memory/retrieve?memoryId=mem-abc123&hard=false
```

## Usage Examples

### Basic Usage

```typescript
import { memoryService } from '@/lib/memory';

// Store a memory
const memory = await memoryService.store(
  {
    userId: 'user-123',
    content: 'User is working on a React TypeScript project',
    metadata: { source: 'conversation', type: 'context' },
  },
  {
    importance: 7,
    summary: 'Project context',
  }
);

// Search memories
const results = await memoryService.retrieve(
  'user-123',
  'What is the user working on?',
  {
    limit: 5,
    threshold: 0.7,
  }
);

// Hybrid search (vector + graph)
const hybridResults = await memoryService.hybridSearch(
  'user-123',
  'React TypeScript',
  {
    limit: 10,
    includeGraph: true,
  }
);

console.log('Vector results:', hybridResults.memories);
console.log('Graph results:', hybridResults.graphResults);
console.log('Combined:', hybridResults.combined);
```

### Advanced Usage

```typescript
// Get all memories for a user
const allMemories = await memoryService.getAll('user-123', {
  limit: 100,
  conversationId: 'conv-456',
});

// Get specific memory by ID
const memory = await memoryService.getById('mem-abc123');

// Get user statistics
const stats = await memoryService.getStats('user-123');
console.log('Total memories:', stats.total);
console.log('Average importance:', stats.avgImportance);
console.log('Total accesses:', stats.totalAccesses);

// Delete memory (soft delete)
await memoryService.delete('mem-abc123');

// Hard delete (permanent)
await memoryService.delete('mem-abc123', true);
```

## Configuration

### Environment Variables

```bash
# OpenRouter API Key (for embeddings via OpenAI)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Neon Postgres (pgvector)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require <!-- pragma: allowlist secret -->

# Neo4j (for graph features)
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxxxx
```

### Memory Service Configuration

```typescript
import { MemoryService } from '@/lib/memory';

const memoryService = new MemoryService({
  enableGraph: true,              // Enable Neo4j graph integration
  enableVectorPersistence: true,  // Enable pgvector persistence
  llmModel: 'gpt-4.1-nano-2025-04-14',  // Mem0 LLM model
});
```

## Testing

### Manual Testing

Use the test endpoint (development only):

```bash
# Run tests
curl http://localhost:3300/api/memory/test

# Clean up test data
curl -X DELETE http://localhost:3300/api/memory/test
```

### Integration Test

```typescript
import { memoryService } from '@/lib/memory';

describe('Memory Integration', () => {
  it('should store and retrieve memories', async () => {
    // Store
    const memory = await memoryService.store({
      userId: 'test-user',
      content: 'Test memory content',
      metadata: { test: true },
    });

    expect(memory.id).toBeDefined();

    // Retrieve
    const results = await memoryService.retrieve(
      'test-user',
      'Test memory',
      { limit: 1 }
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Test memory');
  });

  it('should perform hybrid search', async () => {
    const results = await memoryService.hybridSearch(
      'test-user',
      'memory content',
      { includeGraph: true }
    );

    expect(results.memories).toBeDefined();
    expect(results.metadata).toBeDefined();
    expect(results.metadata.vectorResults).toBeGreaterThanOrEqual(0);
  });
});
```

## Performance Considerations

### Vector Search
- **Index**: IVFFlat index created on embeddings column
- **Threshold**: Higher threshold = fewer results, faster search
- **Limit**: Reasonable limit (10-50) for best performance

### Embedding Generation
- **Cost**: ~$0.02 per 1M tokens
- **Latency**: ~100-300ms per embedding
- **Batch**: Use batch operations when possible

### Best Practices
- Set appropriate similarity thresholds (0.7-0.85 recommended)
- Use importance scoring to prioritize critical memories
- Implement soft delete for audit trails
- Monitor access patterns and optimize based on usage

## Troubleshooting

### Database Not Connected
```
Error: Database connection failed
```
**Solution**: Verify `DATABASE_URL` in `.env` and ensure pgvector extension is enabled in Neon console.

### Embeddings Not Persisting
```
Warning: Using random test embedding (development only)
```
**Solution**: Set `OPENROUTER_API_KEY` in `.env`.

### Graph Features Not Working
```
Warning: Neo4j not configured. Graph features will be disabled.
```
**Solution**: Set `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` in `.env`.

## Implementation Summary

### What Was Implemented
✅ pgvector integration for persistent vector storage
✅ OpenAI embeddings service (text-embedding-3-small)
✅ Updated MemoryService to use pgvector instead of in-memory
✅ Hybrid search combining pgvector + Neo4j graph
✅ Complete API routes (store, search, retrieve, delete)
✅ Test endpoint for validation
✅ User isolation and conversation scoping
✅ Access tracking and statistics
✅ Soft delete support

### Architecture Improvements
- **Persistent storage**: Memories survive server restarts
- **Scalable search**: IVFFlat index for fast similarity search
- **Hybrid results**: Best of vector search + graph traversal
- **Type safety**: Full TypeScript integration
- **Error handling**: Graceful degradation when components unavailable

## Next Steps

Potential enhancements:
- [ ] Add batch embedding generation for bulk imports
- [ ] Implement memory importance auto-scoring
- [ ] Add conversation summarization
- [ ] Implement memory decay based on access patterns
- [ ] Add full-text search fallback
- [ ] Implement memory clustering for topic discovery
- [ ] Add memory export/import functionality
