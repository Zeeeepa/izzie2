# Hybrid Retrieval System

Production-ready hybrid retrieval combining vector similarity and graph traversal with intelligent query parsing and weighted ranking.

## Overview

The retrieval system optimizes search performance by:

1. **Smart Query Parsing** - Detects intent and extracts entities/keywords
2. **Parallel Execution** - Runs vector and graph queries concurrently
3. **Weighted Ranking** - Combines scores with configurable weights
4. **Result Caching** - LRU cache for frequently accessed queries
5. **Performance Target** - <500ms P95 latency for typical queries

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Retrieval Service                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │     Query Parser          │
              │  - Entity extraction      │
              │  - Intent detection       │
              │  - Temporal parsing       │
              └───────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
    ┌─────────────────────┐     ┌─────────────────────┐
    │  Vector Search      │     │   Graph Search      │
    │  (pgvector)         │     │   (Neo4j)           │
    │  - Semantic match   │     │   - Entity match    │
    │  - Cosine similarity│     │   - Relationships   │
    └─────────────────────┘     └─────────────────────┘
                │                           │
                └─────────────┬─────────────┘
                              ▼
              ┌───────────────────────────┐
              │    Weighted Ranker        │
              │  - Score combination      │
              │  - Recency boost          │
              │  - Importance boost       │
              │  - Entity overlap         │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │   Result Deduplication    │
              │   & Final Ranking         │
              └───────────────────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │     Cache     │
                      │   (LRU, TTL)  │
                      └───────────────┘
```

## Components

### 1. Query Parser (`src/lib/retrieval/parser.ts`)

Parses natural language queries to extract structured information.

**Features:**
- Query type detection (factual, relational, temporal, exploratory, semantic)
- Entity extraction from capitalized words and quoted strings
- Keyword extraction with stop word filtering
- Temporal constraint parsing ("recent", "last week", etc.)
- Confidence scoring for parsing quality

**Query Types:**

| Type | Pattern | Example | Strategy |
|------|---------|---------|----------|
| **Factual** | "What is...", "Tell me about..." | "What is Project X?" | Vector-heavy (70/30) |
| **Relational** | "Who works with...", "Related to..." | "Who works with John?" | Graph-heavy (30/70) |
| **Temporal** | "Recent", "Last week", "Today" | "Recent updates from team" | Vector + recency boost |
| **Exploratory** | "Show me all...", "Explore..." | "Show me everything about X" | Balanced (50/50) |
| **Semantic** | General queries | "Machine learning tutorials" | Default (60/40) |

**Example:**
```typescript
import { parseQuery } from '@/lib/retrieval/parser';

const parsed = parseQuery("Who works with Sarah on the authentication project?");

// Output:
{
  original: "Who works with Sarah on the authentication project?",
  type: "relational",
  entities: ["Sarah"],
  keywords: ["works", "authentication", "project"],
  intent: "Find relationships and connections for: Sarah",
  confidence: 0.85
}
```

### 2. Weighted Ranker (`src/lib/retrieval/ranker.ts`)

Combines multiple scoring signals with configurable weights.

**Default Weights:**
```typescript
{
  vector: 0.6,        // 60% - Semantic similarity
  graph: 0.4,         // 40% - Graph relevance
  recency: 0.15,      // 15% - Recent items boost
  importance: 0.1,    // 10% - Importance score
  entityOverlap: 0.2  // 20% - Entity match boost
}
```

**Scoring Formula:**
```
combined_score =
  (vector_similarity × vector_weight) +
  (graph_relevance × graph_weight) +
  (recency_score × recency_weight) +
  (importance_score × importance_weight) +
  (entity_overlap × entity_overlap_weight)
```

**Recency Decay Curve:**
- Today: 1.0
- Last 7 days: 0.9
- Last 30 days: 0.7
- Last 90 days: 0.5
- 90+ days: 0.3

**Example:**
```typescript
import { rankVectorResults, mergeAndRank } from '@/lib/retrieval/ranker';

// Rank vector results
const rankedVector = rankVectorResults(vectorResults, parsedQuery, weights);

// Rank graph results
const rankedGraph = rankGraphResults(graphResults, parsedQuery, weights);

// Merge and re-rank
const finalResults = mergeAndRank(rankedVector, rankedGraph, weights);
```

### 3. Result Cache (`src/lib/retrieval/cache.ts`)

LRU cache with TTL for frequent queries.

**Configuration:**
- Max size: 100 entries (configurable)
- TTL: 300 seconds (5 minutes, configurable)
- LRU eviction policy

**Features:**
- Automatic cache invalidation on expiry
- Hit tracking for popular queries
- Cache statistics and monitoring

**Example:**
```typescript
import { retrievalCache } from '@/lib/retrieval/cache';

// Cache is automatically used by RetrievalService
// Manual operations:

// Get stats
const stats = retrievalCache.getStats();

// Clear cache
retrievalCache.clear();

// Clear expired entries
retrievalCache.clearExpired();
```

### 4. Retrieval Service (`src/lib/retrieval/index.ts`)

Main orchestrator for hybrid retrieval.

**Configuration:**
```typescript
interface RetrievalConfig {
  weights?: Partial<RetrievalWeights>;
  vectorLimit?: number;      // Default: 20
  graphLimit?: number;        // Default: 10
  finalLimit?: number;        // Default: 10
  vectorThreshold?: number;   // Default: 0.6
  cacheEnabled?: boolean;     // Default: true
  cacheTTL?: number;          // Default: 300s
  parallelExecution?: boolean;// Default: true
}
```

**Example:**
```typescript
import { retrievalService } from '@/lib/retrieval';

// Search with default config
const result = await retrievalService.search(
  userId,
  "Recent updates from the engineering team",
  {
    limit: 10,
    includeGraph: true,
    conversationId: 'conv-123'
  }
);

// Custom configuration
retrievalService.updateConfig({
  weights: {
    vector: 0.7,
    graph: 0.3,
    recency: 0.2
  },
  vectorLimit: 30,
  finalLimit: 15
});

// Cache management
const stats = retrievalService.getCacheStats();
retrievalService.clearCache();
```

## API Usage

### POST /api/retrieval/search

Execute hybrid retrieval search.

**Request:**
```json
{
  "userId": "user-123",
  "query": "Who works with John on authentication?",
  "conversationId": "conv-456",
  "limit": 10,
  "includeGraph": true,
  "forceRefresh": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": {
      "original": "Who works with John on authentication?",
      "type": "relational",
      "entities": ["John"],
      "keywords": ["works", "authentication"],
      "intent": "Find relationships and connections for: John",
      "confidence": 0.85
    },
    "results": [
      {
        "source": "vector",
        "content": { /* MemoryEntry */ },
        "scores": {
          "vector": 0.89,
          "recency": 0.9,
          "importance": 0.7,
          "entityOverlap": 1.0,
          "combined": 0.87
        },
        "metadata": {
          "matchedEntities": ["John"],
          "matchedKeywords": ["authentication"],
          "relevanceReason": "Highly similar content, Recent activity, Matching entities"
        }
      }
    ],
    "metadata": {
      "vectorResults": 15,
      "graphResults": 5,
      "totalCandidates": 18,
      "finalResults": 10,
      "executionTime": 245,
      "weights": { /* RetrievalWeights */ }
    }
  },
  "meta": {
    "executionTime": 245,
    "timestamp": "2025-01-05T10:30:00.000Z"
  }
}
```

### GET /api/retrieval/search

Get cache statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "size": 42,
    "maxSize": 100,
    "ttl": 300,
    "entries": [
      {
        "query": "recent updates",
        "userId": "user-123",
        "hits": 5,
        "age": 120
      }
    ]
  }
}
```

### DELETE /api/retrieval/search

Clear retrieval cache.

**Response:**
```json
{
  "success": true,
  "message": "Cache cleared"
}
```

## Performance Benchmarks

### Target Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| P50 latency | <200ms | Typical query |
| P95 latency | <500ms | Complex query with graph |
| P99 latency | <1000ms | Cache miss + large result set |
| Cache hit rate | >40% | For frequently searched queries |
| Vector search | <100ms | pgvector indexed search |
| Graph search | <150ms | Neo4j with proper indexes |

### Optimization Strategies

1. **Parallel Execution**
   - Vector and graph queries run concurrently
   - Reduces total latency by ~40%

2. **Result Caching**
   - LRU cache with 5-minute TTL
   - Eliminates redundant queries
   - ~90% latency reduction for cache hits

3. **Query Limits**
   - Vector search: 20 candidates (configurable)
   - Graph search: 10 candidates (configurable)
   - Final results: 10 (configurable)
   - Prevents over-fetching

4. **Index Optimization**
   - pgvector: IVFFlat index on embeddings
   - Neo4j: Indexes on entity names and frequencies
   - Database query optimization

## Usage Examples

### Basic Search
```typescript
import { retrievalService } from '@/lib/retrieval';

const results = await retrievalService.search(
  'user-123',
  'machine learning tutorials'
);

console.log(`Found ${results.results.length} results in ${results.metadata.executionTime}ms`);
```

### Advanced Search with Options
```typescript
const results = await retrievalService.search(
  'user-123',
  'Who are the experts on GraphQL?',
  {
    conversationId: 'conv-456',
    limit: 20,
    includeGraph: true,
    forceRefresh: true  // Bypass cache
  }
);

// Analyze results
for (const result of results.results) {
  console.log(`
    Source: ${result.source}
    Score: ${result.scores.combined.toFixed(2)}
    Content: ${result.source === 'vector' ? result.content.content : result.content.node.name}
    Reason: ${result.metadata.relevanceReason}
  `);
}
```

### Custom Configuration
```typescript
import { RetrievalService } from '@/lib/retrieval';

const customRetrieval = new RetrievalService({
  weights: {
    vector: 0.8,      // Prioritize semantic similarity
    graph: 0.2,
    recency: 0.1,
    importance: 0.05,
    entityOverlap: 0.15
  },
  vectorLimit: 30,
  graphLimit: 15,
  finalLimit: 20,
  vectorThreshold: 0.7,  // Higher threshold
  cacheEnabled: true,
  cacheTTL: 600,         // 10 minutes
  parallelExecution: true
});

const results = await customRetrieval.search(userId, query);
```

### Integration with Memory Service
```typescript
import { memoryService } from '@/lib/memory';

// Memory service now uses optimized retrieval internally
const results = await memoryService.hybridSearch(
  'user-123',
  'Recent project updates',
  {
    limit: 10,
    includeGraph: true,
    conversationId: 'conv-789'
  }
);

console.log(`
  Vector results: ${results.metadata.vectorResults}
  Graph results: ${results.metadata.graphResults}
  Combined: ${results.metadata.combinedResults}
`);
```

## Testing

### Unit Tests
```typescript
// Test query parsing
import { parseQuery } from '@/lib/retrieval/parser';

test('should detect relational queries', () => {
  const parsed = parseQuery("Who works with Sarah?");
  expect(parsed.type).toBe('relational');
  expect(parsed.entities).toContain('Sarah');
});

// Test ranking
import { rankVectorResults } from '@/lib/retrieval/ranker';

test('should rank by combined score', () => {
  const ranked = rankVectorResults(results, query, weights);
  expect(ranked[0].scores.combined).toBeGreaterThan(ranked[1].scores.combined);
});
```

### Integration Tests
```typescript
import { retrievalService } from '@/lib/retrieval';

test('should complete search in <500ms', async () => {
  const start = Date.now();
  const result = await retrievalService.search('user-123', 'test query');
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(500);
  expect(result.metadata.executionTime).toBeLessThan(500);
});

test('should cache repeated queries', async () => {
  const query = 'test query';

  // First call - cache miss
  const result1 = await retrievalService.search('user-123', query);
  expect(result1.metadata.cacheHit).toBeUndefined();

  // Second call - cache hit
  const result2 = await retrievalService.search('user-123', query);
  expect(result2.metadata.cacheHit).toBe(true);
});
```

### Performance Tests
```typescript
import { retrievalService } from '@/lib/retrieval';

async function benchmarkRetrieval() {
  const queries = [
    "What is machine learning?",
    "Who works with John on authentication?",
    "Recent updates from engineering team",
    "Explore all GraphQL projects"
  ];

  const results = [];

  for (const query of queries) {
    const start = Date.now();
    const result = await retrievalService.search('user-123', query);
    const duration = Date.now() - start;

    results.push({
      query,
      type: result.query.type,
      duration,
      resultsCount: result.results.length,
      vectorResults: result.metadata.vectorResults,
      graphResults: result.metadata.graphResults
    });
  }

  // Calculate statistics
  const durations = results.map(r => r.duration);
  const p50 = durations.sort()[Math.floor(durations.length * 0.5)];
  const p95 = durations.sort()[Math.floor(durations.length * 0.95)];

  console.log(`
    P50 latency: ${p50}ms
    P95 latency: ${p95}ms
    Average results: ${results.reduce((sum, r) => sum + r.resultsCount, 0) / results.length}
  `);
}
```

## Monitoring

### Metrics to Track

1. **Latency**
   - P50, P95, P99 response times
   - Vector vs graph search times
   - Cache hit/miss latencies

2. **Cache Performance**
   - Hit rate
   - Eviction rate
   - Average age of cached entries

3. **Result Quality**
   - Average combined score
   - Result diversity (vector vs graph ratio)
   - User engagement with results

4. **Resource Usage**
   - Memory usage (cache size)
   - Database query counts
   - API request volume

### Example Monitoring
```typescript
// Get retrieval statistics
const stats = retrievalService.getCacheStats();

console.log(`
  Cache size: ${stats.size}/${stats.maxSize}
  Top queries: ${stats.entries.slice(0, 5).map(e => e.query)}
  Average hits: ${stats.entries.reduce((sum, e) => sum + e.hits, 0) / stats.entries.length}
`);

// Log performance metrics
const result = await retrievalService.search(userId, query);

console.log(`
  Query type: ${result.query.type}
  Execution time: ${result.metadata.executionTime}ms
  Results: ${result.results.length}
  Sources: ${result.metadata.vectorResults} vector, ${result.metadata.graphResults} graph
  Cache hit: ${result.metadata.cacheHit ? 'Yes' : 'No'}
`);
```

## Future Enhancements

1. **Advanced NLP Parsing**
   - Use LLM for entity extraction
   - Better intent classification
   - Multi-language support

2. **Adaptive Weights**
   - Learn optimal weights per user
   - Adjust based on click-through rates
   - A/B testing different strategies

3. **Distributed Caching**
   - Redis for multi-instance caching
   - Shared cache across servers
   - Cache invalidation strategies

4. **Query Expansion**
   - Synonym expansion
   - Automatic query reformulation
   - Related term suggestions

5. **Result Re-ranking**
   - Learning-to-rank models
   - User feedback integration
   - Personalized ranking

## Troubleshooting

### Slow Queries
- Check vector index status: `SELECT * FROM pg_indexes WHERE tablename = 'memory_entries';`
- Verify Neo4j indexes: `SHOW INDEXES`
- Reduce `vectorLimit` and `graphLimit`
- Enable caching if disabled

### Low Result Quality
- Adjust weight configuration
- Lower `vectorThreshold` for more results
- Increase query parsing confidence threshold
- Review entity extraction logic

### High Memory Usage
- Reduce cache `maxSize`
- Lower `cacheTTL`
- Clear cache manually: `retrievalService.clearCache()`

### Cache Not Working
- Verify `cacheEnabled: true` in config
- Check cache statistics
- Ensure queries are identical (case-sensitive)

## Related Documentation

- [Memory Service](./memory-service.md)
- [Vector Operations](./vector-operations.md)
- [Graph Queries](./graph-queries.md)
- [API Reference](./api-reference.md)
