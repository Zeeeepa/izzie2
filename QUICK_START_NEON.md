# Quick Start: Neon Postgres + pgvector

## 🚀 5-Minute Setup

### Step 1: Create Neon Database (2 minutes)

1. Go to https://console.neon.tech/
2. Click "New Project"
3. Name it "izzie2"
4. Copy the connection string (looks like `postgresql://user:pass@host/db`) <!-- pragma: allowlist secret -->
5. In Neon SQL Editor, run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Step 2: Configure Environment (30 seconds)

```bash
# Copy example to .env
cp .env.example .env

# Edit .env and paste your Neon connection string
# DATABASE_URL=postgresql://user:pass@host/db?sslmode=require # pragma: allowlist secret
```

### Step 3: Run Migrations (1 minute)

```bash
npm run db:migrate
```

Expected output:
```
🔌 Connecting to database...
🚀 Running migrations...
✅ Migrations completed successfully
```

### Step 4: Test Connection (1 minute)

```bash
# Start dev server
npm run dev

# In another terminal, test the connection
curl http://localhost:3300/api/db/test
```

Expected: `{"status": "connected", ...}`

### Step 5: Test Vector Operations (30 seconds)

```bash
curl -X POST http://localhost:3300/api/db/test \
  -H "Content-Type: application/json" \
  -d '{"action": "test-vector", "userId": "test-user"}'
```

Expected: `{"status": "success", "results": {...}}`

## ✅ You're Done!

Your database is ready for semantic memory storage.

## 📝 Quick Code Examples

### Insert a Memory
```typescript
import { vectorOps } from '@/lib/db';
import { OpenAI } from 'openai';

const openai = new OpenAI();

// Generate embedding
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'User prefers dark mode',
});

// Store memory
const memory = await vectorOps.insertVector({
  userId: 'user-123',
  content: 'User prefers dark mode',
  embedding: response.data[0].embedding,
  importance: 8,
});
```

### Search Similar Memories
```typescript
// Generate query embedding
const queryEmbed = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'What are user preferences?',
});

// Search
const results = await vectorOps.searchSimilar(
  queryEmbed.data[0].embedding,
  {
    userId: 'user-123',
    limit: 5,
    threshold: 0.7, // 70% similarity minimum
  }
);

// Use results
results.forEach(r => {
  console.log(`${r.content} (${(r.similarity * 100).toFixed(0)}% match)`);
});
```

## 🔧 Useful Commands

```bash
# View database in browser UI
npm run db:studio

# Generate new migration after schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Push schema changes without migration files
npm run db:push
```

## 📚 Full Documentation

- **Setup Guide**: `docs/NEON_SETUP.md`
- **API Reference**: `src/lib/db/README.md`
- **Implementation Details**: `NEON_IMPLEMENTATION.md`

## 🆘 Troubleshooting

**"Database connection string not configured"**
→ Set `DATABASE_URL` in `.env`

**"Connection failed"**
→ Check Neon project is active (not paused)
→ Verify credentials in connection string

**"pgvector extension not found"**
→ Run `CREATE EXTENSION vector;` in Neon SQL Editor

**Low similarity scores**
→ Ensure using same embedding model (text-embedding-3-small)
→ Try lowering threshold parameter

## 🎯 What's Next?

1. Integrate with your chat/conversation flow
2. Generate embeddings for user messages
3. Store important context as memories
4. Search memories for relevant context
5. Use in RAG (Retrieval Augmented Generation) pipelines

Need help? Check the full docs or ask!
