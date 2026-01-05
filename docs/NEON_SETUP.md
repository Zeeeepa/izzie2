# Neon Postgres Setup Guide

This guide walks you through setting up Neon Postgres with pgvector extension for the Izzie2 project.

## Overview

**Tech Stack:**
- **Neon Postgres**: Serverless PostgreSQL database
- **Drizzle ORM**: TypeScript-native ORM (smaller bundle than Prisma)
- **pgvector Extension**: Vector storage and similarity search
- **OpenAI Embeddings**: text-embedding-3-small (1536 dimensions)
- **IVFFlat Index**: Fast approximate nearest neighbor search

## Step 1: Create Neon Database

1. **Sign up/Login to Neon**
   - Go to https://console.neon.tech/
   - Create a new account or sign in

2. **Create a New Project**
   - Click "New Project"
   - Choose a region close to your users
   - Name it "izzie2" or similar

3. **Get Connection String**
   - In your project dashboard, find the connection string
   - Format: `postgresql://user:password@host/database?sslmode=require` <!-- pragma: allowlist secret -->
   - Copy this for the next step

4. **Enable pgvector Extension**
   - In Neon console, go to "SQL Editor"
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Verify: `SELECT * FROM pg_extension WHERE extname = 'vector';`

## Step 2: Configure Environment Variables

1. **Copy `.env.example` to `.env`**
   ```bash
   cp .env.example .env
   ```

2. **Add your Neon connection string**
   ```env
   DATABASE_URL=postgresql://user:password@host/database?sslmode=require <!-- pragma: allowlist secret -->
   ```

3. **Verify connection string format**
   - Must include `?sslmode=require` at the end
   - Replace `user`, `password`, `host`, and `database` with your actual values

## Step 3: Run Database Migrations

The initial migration creates tables and indexes for:
- `users` - User accounts
- `conversations` - Conversation sessions
- `memory_entries` - Memory entries with vector embeddings

Run the migration:

```bash
npm run db:migrate
```

Expected output:
```
🔌 Connecting to database...
🚀 Running migrations...
✅ Migrations completed successfully
👋 Database connection closed
```

## Step 4: Verify Setup

### Option 1: Using the Test API Route

**Start the development server:**
```bash
npm run dev
```

**Test connection:**
```bash
curl http://localhost:3300/api/db/test
```

Expected response:
```json
{
  "status": "connected",
  "timestamp": "2025-01-05T19:00:00.000Z",
  "stats": {
    "tables": [...],
    "extensions": ["vector"],
    "indexes": [...]
  },
  "message": "Database connection successful"
}
```

**Test vector operations:**
```bash
curl -X POST http://localhost:3300/api/db/test \
  -H "Content-Type: application/json" \
  -d '{"action": "test-vector", "userId": "test-user"}'
```

Expected response:
```json
{
  "status": "success",
  "action": "test-vector",
  "results": {
    "inserted": {
      "id": "uuid-here",
      "content": "Test memory entry for vector search",
      "importance": 7
    },
    "search": {
      "count": 1,
      "results": [...]
    },
    "stats": {
      "total": 1,
      "avgImportance": 7,
      "totalAccesses": 0
    }
  }
}
```

### Option 2: Using Drizzle Studio

Drizzle Studio provides a web UI to browse your database:

```bash
npm run db:studio
```

This opens https://local.drizzle.studio in your browser where you can:
- Browse all tables
- View data
- Run queries
- Inspect schema

## Step 5: Using in Your Code

### Import the database client

```typescript
import { dbClient, vectorOps, schema } from '@/lib/db';
```

### Initialize connection (automatic)

The client initializes automatically when first used:

```typescript
// Just use it - initialization happens automatically
const db = dbClient.getDb();
```

### Insert a memory with vector embedding

```typescript
import { vectorOps } from '@/lib/db';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Generate embedding
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'User prefers dark mode and concise responses',
});

const embedding = embeddingResponse.data[0].embedding;

// Insert memory
const memory = await vectorOps.insertVector({
  userId: 'user-123',
  conversationId: 'conv-456',
  content: 'User prefers dark mode and concise responses',
  summary: 'UI preferences',
  embedding,
  metadata: {
    source: 'conversation',
    tags: ['preferences', 'ui'],
  },
  importance: 8,
});
```

### Search for similar memories

```typescript
// Generate embedding for search query
const queryEmbedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'What are the user preferences?',
});

// Search
const results = await vectorOps.searchSimilar(
  queryEmbedding.data[0].embedding,
  {
    userId: 'user-123',
    limit: 5,
    threshold: 0.7, // Only return results with >70% similarity
    minImportance: 5,
  }
);

results.forEach((result) => {
  console.log(`Similarity: ${result.similarity.toFixed(2)}`);
  console.log(`Content: ${result.content}`);
});
```

### Get recent memories

```typescript
const recent = await vectorOps.getRecent('user-123', {
  limit: 10,
  conversationId: 'conv-456', // Optional filter
});
```

### Update memory importance

```typescript
await vectorOps.updateVector(memoryId, {
  importance: 9,
  metadata: { ...existingMetadata, updated: true },
});
```

### Get user statistics

```typescript
const stats = await vectorOps.getStats('user-123');
console.log(`Total memories: ${stats.total}`);
console.log(`Average importance: ${stats.avgImportance}`);
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Conversations Table
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Memory Entries Table
```sql
CREATE TABLE memory_entries (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  summary TEXT,
  metadata JSONB,
  embedding vector(1536), -- pgvector type
  importance INTEGER DEFAULT 5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Available Scripts

```bash
# Generate new migration from schema changes
npm run db:generate

# Run pending migrations
npm run db:migrate

# Open Drizzle Studio (database browser UI)
npm run db:studio

# Push schema changes directly (skip migration files)
npm run db:push
```

## Vector Search Details

### Similarity Scoring

The implementation uses **cosine similarity** for vector search:
- Range: 0.0 to 1.0 (1.0 = identical, 0.0 = completely different)
- Calculated as: `1 - cosine_distance`
- Optimal for normalized embeddings (like OpenAI's)

### Index Configuration

**IVFFlat Index:**
- Type: Inverted File with Flat compression
- Lists: 100 (suitable for small to medium datasets)
- Distance operator: `vector_cosine_ops`
- Trade-off: ~10x faster than exact search with minimal accuracy loss

**When to adjust:**
- More data (>100k rows): Increase lists to ~sqrt(rows)
- Need exact results: Remove index, use exact search
- Need faster search: Consider HNSW index (requires Neon Enterprise)

### Performance Tips

1. **Use appropriate thresholds:**
   - 0.9-1.0: Nearly identical matches
   - 0.7-0.9: Highly similar
   - 0.5-0.7: Moderately similar
   - <0.5: Different topics

2. **Filter before vector search:**
   - Use `userId`, `conversationId`, `importance` filters
   - Reduces search space = faster queries

3. **Batch inserts:**
   - Insert multiple memories in a transaction
   - Better performance than individual inserts

4. **Monitor slow queries:**
   - Queries >100ms are logged as warnings
   - Check indexes if you see many slow queries

## Troubleshooting

### Connection Issues

**Error: "Database connection string not configured"**
- Ensure `DATABASE_URL` is set in `.env`
- Verify the connection string format includes `?sslmode=require`

**Error: "Connection failed"**
- Check if Neon project is active (not paused)
- Verify credentials are correct
- Test connection in Neon SQL Editor first

### Migration Issues

**Error: "pgvector extension not found"**
- Enable pgvector in Neon console: `CREATE EXTENSION vector;`
- Neon includes pgvector by default on all plans

**Error: "Migration failed"**
- Check if migrations were already run: Look at `drizzle_migrations` table
- Try manual migration via Neon SQL Editor with `/drizzle/migrations/0000_initial.sql`

### Vector Search Issues

**Low similarity scores for expected matches**
- Verify embeddings are from the same model (text-embedding-3-small)
- Check if embeddings are normalized (they should be)
- Try lowering the threshold parameter

**Slow search queries**
- Verify IVFFlat index exists: Check `getStats()` output
- Increase `lists` parameter for larger datasets
- Add filters (userId, importance) to reduce search space

## Production Deployment

### Environment Variables
- Set `DATABASE_URL` in your production environment
- Ensure `NODE_ENV=production` to disable test endpoints

### Security Checklist
- ✅ Test endpoint (`/api/db/test`) is blocked in production
- ✅ Connection uses SSL (`?sslmode=require`)
- ✅ Database credentials stored securely (not in code)
- ✅ Soft deletes used for user data (GDPR compliance)

### Monitoring
- Monitor query performance with Neon's built-in metrics
- Set up alerts for slow queries (>1s)
- Track database size and connection pool usage

### Backup Strategy
- Neon provides automatic daily backups
- Configure point-in-time recovery in Neon console
- Test restore procedure regularly

## Next Steps

1. **Integrate with OpenAI embeddings** - Generate real embeddings for memory entries
2. **Add user management** - Create users and conversations via API
3. **Implement memory retrieval** - Use vector search in chat contexts
4. **Add memory cleanup** - Implement retention policies for old memories
5. **Monitor performance** - Track query times and optimize indexes

## Resources

- [Neon Documentation](https://neon.tech/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
