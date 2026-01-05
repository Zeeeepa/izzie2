# Database Module - Neon Postgres with pgvector

This module provides a complete database layer for Izzie2 using Neon Postgres with pgvector extension for semantic memory storage.

## Module Structure

```
src/lib/db/
├── client.ts       # Neon database client (singleton)
├── schema.ts       # Drizzle schema definitions
├── vectors.ts      # Vector operations service
├── index.ts        # Public API exports
└── README.md       # This file
```

## Quick Start

```typescript
import { dbClient, vectorOps } from '@/lib/db';

// Verify connection
const isConnected = await dbClient.verifyConnection();

// Insert a memory with vector
const memory = await vectorOps.insertVector({
  userId: 'user-123',
  content: 'Important information',
  embedding: [0.1, 0.2, ...], // 1536-dimensional vector
  importance: 8,
});

// Search similar memories
const results = await vectorOps.searchSimilar(queryEmbedding, {
  userId: 'user-123',
  limit: 5,
  threshold: 0.7,
});
```

## Core Components

### 1. Database Client (`client.ts`)

Singleton wrapper for Neon serverless driver with Drizzle ORM.

**Key Features:**
- Automatic connection management
- Health checks and verification
- Database setup (enable extensions, create indexes)
- Statistics and monitoring
- Development-only data clearing

**Example:**
```typescript
import { dbClient } from '@/lib/db';

// Get Drizzle instance
const db = dbClient.getDb();

// Execute raw SQL
const results = await dbClient.executeRaw<User>('SELECT * FROM users WHERE email = $1', ['user@example.com']);

// Get database stats
const stats = await dbClient.getStats();
console.log(stats.tables); // Table row counts
console.log(stats.extensions); // Installed extensions
console.log(stats.indexes); // Created indexes

// Verify connection
const isHealthy = await dbClient.verifyConnection();
```

### 2. Schema Definitions (`schema.ts`)

Drizzle schema for all database tables.

**Tables:**
- `users` - User accounts with email, name, metadata
- `conversations` - Conversation sessions linked to users
- `memory_entries` - Memory entries with vector embeddings

**Types:**
```typescript
import { User, Conversation, MemoryEntry } from '@/lib/db/schema';

// Inferred types
type NewUser = typeof users.$inferInsert;
type ExistingUser = typeof users.$inferSelect;
```

**Example:**
```typescript
import { dbClient, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

const db = dbClient.getDb();

// Insert user
const [newUser] = await db
  .insert(schema.users)
  .values({
    email: 'user@example.com',
    name: 'John Doe',
    metadata: { preferences: { theme: 'dark' } },
  })
  .returning();

// Query users
const users = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, 'user@example.com'));
```

### 3. Vector Operations (`vectors.ts`)

High-level service for vector operations and semantic search.

**Available Methods:**

#### `insertVector(data)`
Insert a new memory entry with vector embedding.

```typescript
const memory = await vectorOps.insertVector({
  userId: 'user-123',
  conversationId: 'conv-456', // Optional
  content: 'User prefers dark mode',
  summary: 'UI preference',
  embedding: [0.1, 0.2, ...], // 1536 dimensions
  metadata: {
    source: 'conversation',
    tags: ['preferences'],
  },
  importance: 7, // 1-10 scale
});
```

#### `searchSimilar(embedding, options)`
Search for similar vectors using cosine similarity.

```typescript
const results = await vectorOps.searchSimilar(queryEmbedding, {
  userId: 'user-123',           // Filter by user
  conversationId: 'conv-456',   // Filter by conversation
  limit: 10,                    // Max results
  threshold: 0.7,               // Min similarity (0-1)
  minImportance: 5,             // Min importance score
  excludeDeleted: true,         // Exclude soft-deleted
});

// Results include similarity score
results.forEach((result) => {
  console.log(`${result.content} (${result.similarity.toFixed(2)})`);
});
```

#### `updateVector(id, data)`
Update a memory entry's content, embedding, or metadata.

```typescript
await vectorOps.updateVector(memoryId, {
  content: 'Updated content',
  embedding: newEmbedding,
  importance: 9,
  metadata: { updated: true },
});
```

#### `deleteVector(id, hard?)`
Delete a memory entry (soft or hard delete).

```typescript
// Soft delete (marks as deleted, keeps data)
await vectorOps.deleteVector(memoryId);

// Hard delete (permanently removes)
await vectorOps.deleteVector(memoryId, true);
```

#### `getById(id, trackAccess?)`
Get a memory entry by ID and optionally track access.

```typescript
const memory = await vectorOps.getById(memoryId, true);
// Increments access_count and updates last_accessed_at
```

#### `getRecent(userId, options)`
Get recent memories for a user.

```typescript
const recent = await vectorOps.getRecent('user-123', {
  limit: 20,
  conversationId: 'conv-456', // Optional
  excludeDeleted: true,
});
```

#### `getStats(userId)`
Get memory statistics for a user.

```typescript
const stats = await vectorOps.getStats('user-123');
console.log(stats.total); // Total memories
console.log(stats.avgImportance); // Average importance
console.log(stats.totalAccesses); // Total times accessed
console.log(stats.byConversation); // Breakdown by conversation
```

## Database Schema Details

### Users Table
```typescript
{
  id: UUID (primary key)
  email: string (unique, indexed)
  name: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date (auto-updated)
}
```

### Conversations Table
```typescript
{
  id: UUID (primary key)
  userId: UUID (foreign key to users)
  title: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date (indexed)
  updatedAt: Date (auto-updated)
}
```

### Memory Entries Table
```typescript
{
  id: UUID (primary key)
  conversationId: UUID | null (foreign key to conversations)
  userId: UUID (foreign key to users, indexed)
  content: string (required)
  summary: string | null
  metadata: {
    source?: string
    type?: string
    tags?: string[]
    entities?: Record<string, unknown>
    [key: string]: unknown
  } | null
  embedding: number[] (1536 dimensions, vector type)
  importance: number (1-10 scale, default: 5, indexed)
  accessCount: number (default: 0)
  lastAccessedAt: Date | null
  isDeleted: boolean (default: false)
  createdAt: Date (indexed)
  updatedAt: Date (auto-updated)
}
```

## Vector Search Implementation

### Similarity Calculation

Uses **cosine similarity** via pgvector:
```sql
1 - (embedding <=> query_embedding)
```

**Similarity ranges:**
- 0.9-1.0: Nearly identical
- 0.7-0.9: Highly similar
- 0.5-0.7: Moderately similar
- 0.0-0.5: Different topics

### Indexing Strategy

**IVFFlat Index:**
- Approximate nearest neighbor search
- ~10x faster than exact search
- Configured with 100 lists (suitable for small-medium datasets)
- Uses `vector_cosine_ops` for cosine distance

**Index tuning:**
```sql
-- For larger datasets (>100k rows), increase lists
CREATE INDEX ON memory_entries
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 1000); -- sqrt(total_rows)
```

## Performance Considerations

### Query Optimization

1. **Always filter by userId:**
   ```typescript
   // Good - uses user_id index
   vectorOps.searchSimilar(embedding, { userId: 'user-123' });

   // Bad - searches entire table
   vectorOps.searchSimilar(embedding, {});
   ```

2. **Use appropriate thresholds:**
   ```typescript
   // Strict matching
   vectorOps.searchSimilar(embedding, { threshold: 0.85 });

   // Broad matching
   vectorOps.searchSimilar(embedding, { threshold: 0.6 });
   ```

3. **Limit result sets:**
   ```typescript
   // Good - reasonable limit
   vectorOps.searchSimilar(embedding, { limit: 10 });

   // Bad - too many results
   vectorOps.searchSimilar(embedding, { limit: 1000 });
   ```

### Monitoring

Slow queries (>100ms) are automatically logged:
```
[VectorOps] Slow query (250ms): SELECT * FROM memory_entries...
```

Check `dbClient.getStats()` for table sizes and index health.

## Error Handling

All methods throw errors on failure:

```typescript
try {
  const memory = await vectorOps.insertVector(data);
} catch (error) {
  if (error instanceof Error) {
    console.error('Insert failed:', error.message);
  }
}
```

Common errors:
- `Database not initialized` - Call `dbClient.initialize()` first
- `Foreign key violation` - Referenced user/conversation doesn't exist
- `Invalid embedding dimension` - Must be exactly 1536 numbers

## Testing

Use the test API route for development:

```bash
# Test connection
curl http://localhost:3300/api/db/test

# Test vector operations
curl -X POST http://localhost:3300/api/db/test \
  -H "Content-Type: application/json" \
  -d '{"action": "test-vector"}'

# Setup database (enable extensions, create indexes)
curl -X POST http://localhost:3300/api/db/test \
  -H "Content-Type: application/json" \
  -d '{"action": "setup"}'
```

## Migration Workflow

### Generate migration from schema changes:
```bash
npm run db:generate
```

### Apply migrations:
```bash
npm run db:migrate
```

### Browse database with Drizzle Studio:
```bash
npm run db:studio
```

## Production Checklist

- [ ] Set `DATABASE_URL` in production environment
- [ ] Verify pgvector extension is enabled
- [ ] Run migrations: `npm run db:migrate`
- [ ] Test connection: `dbClient.verifyConnection()`
- [ ] Monitor query performance in Neon console
- [ ] Set up automated backups
- [ ] Configure connection pooling limits
- [ ] Remove or secure test endpoints

## See Also

- [Neon Setup Guide](../../../docs/NEON_SETUP.md) - Complete setup instructions
- [Drizzle Documentation](https://orm.drizzle.team/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
