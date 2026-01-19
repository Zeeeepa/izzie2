# Chat Context Integration - Quick Start Guide

## Prerequisites

Before testing the chat integration, ensure you have:

1. **Weaviate Cloud** configured with credentials in `.env.local`:
   ```env
   WEAVIATE_URL=https://your-cluster.weaviate.network
   WEAVIATE_API_KEY=your-api-key
   OPENAI_API_KEY=your-openai-key
   ```

2. **Entities extracted** from emails/calendar:
   ```bash
   # Check entity count
   npx tsx scripts/check-neo4j-entities.ts
   ```

3. **Memories extracted** (if implemented):
   ```bash
   # Check memory count
   npx tsx scripts/check-db-status.ts
   ```

## Quick Test

### 1. Test Context Retrieval (Standalone)

```bash
# Run the test script
npx tsx scripts/test-chat-context.ts
```

**Expected Output**:
```
=== Testing Chat Context Integration ===

--- Query: "What is happening with the database migration?" ---

Context Summary: Entities: 2 project, 1 person | Memories: 1 event, 1 decision

Entities Found: 2
Sample Entities:
  - project: Database Migration (confidence: 0.85)
  - person: Sarah Developer (confidence: 0.90)

Memories Found: 2
Sample Memories:
  - event: Database migration starts Monday (strength: 0.92)
  - decision: Team decided to use PostgreSQL (strength: 0.78)

System Prompt Length: 450 characters
```

---

### 2. Test Chat API (Full Integration)

#### Option A: Using curl

```bash
# Get auth token (replace with actual login)
TOKEN="your-auth-token"

# Test chat endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is happening with the database migration?",
    "history": []
  }'
```

#### Option B: Using the Chat UI

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the chat interface: `http://localhost:3000/chat`

3. Log in with your account

4. Ask a question that should have context:
   - "What's happening with [project name]?"
   - "When should I schedule a meeting with [person name]?"
   - "What are my upcoming tasks?"

5. Check the browser console for context logs:
   ```
   [Chat API] Context: Entities: 3 person, 1 project | Memories: 2 preference, 1 event
   [Chat API] Refreshed 5 memory access timestamps
   ```

---

### 3. Verify Memory Refresh

After a chat query, verify that memories were refreshed:

```typescript
// Check lastAccessed timestamp
import { getMemoryById } from '@/lib/memory/storage';

const memory = await getMemoryById('memory-id');
console.log('Last Accessed:', memory.lastAccessed);
// Should be updated to current time
```

---

## Sample Test Queries

### Project Status
**Query**: "What's happening with the database migration?"

**Expected Context**:
- Entities: Project "Database Migration", related people
- Memories: Recent events, decisions about the project

**Expected Response**: Natural answer referencing project details, timeline, team members

---

### Meeting Scheduling
**Query**: "When should I schedule the meeting with John?"

**Expected Context**:
- Entities: Person "John Smith"
- Memories: User's meeting preferences, John's availability

**Expected Response**: Suggested time based on preferences

---

### Action Items
**Query**: "What are my upcoming tasks?"

**Expected Context**:
- Entities: Action items with deadlines
- Memories: Reminders, recent decisions

**Expected Response**: List of tasks with context and priorities

---

## Troubleshooting

### No Context Retrieved

**Problem**: Chat returns "No relevant personal context found"

**Solutions**:
1. Verify entities exist in Weaviate:
   ```bash
   npx tsx scripts/check-extraction-status.ts
   ```

2. Check user ID matches:
   ```bash
   # In test-chat-context.ts, replace:
   const userId = 'test-user-id';
   # With your actual user ID from the database
   ```

3. Lower memory strength threshold:
   ```typescript
   const context = await retrieveContext(userId, message, history, {
     minMemoryStrength: 0.1,  // Lower threshold
   });
   ```

---

### Poor Context Relevance

**Problem**: Retrieved context not relevant to query

**Solutions**:
1. Check query term extraction:
   ```typescript
   const terms = extractQueryTerms(message);
   console.log('Query terms:', terms);
   ```

2. Verify entity extraction quality (check confidence scores)

3. Add more specific tags to memories:
   ```typescript
   {
     content: "Database migration starts Monday",
     tags: ["database", "migration", "timeline"],
   }
   ```

---

### Context Too Large

**Problem**: System prompt exceeds token limits

**Solutions**:
1. Reduce context limits:
   ```typescript
   const context = await retrieveContext(userId, message, history, {
     maxEntities: 5,   // Reduced from 10
     maxMemories: 5,   // Reduced from 10
   });
   ```

2. Increase memory strength threshold:
   ```typescript
   minMemoryStrength: 0.5,  // Only very fresh memories
   ```

---

## Monitoring

### Check Console Logs

**Chat API logs**:
```
[Chat API] User user-123 asked: "What's happening with the migration?"
[ChatContext] Extracted query terms from "...": ["happening", "migration"]
[ChatContext] Retrieved 3 entities and 2 memories
[Chat API] Context: Entities: 1 project, 2 person | Memories: 1 event, 1 decision
[Chat API] Refreshed 2 memory access timestamps
```

**Entity search logs**:
```
[Weaviate Entities] Searching for: "migration" (user: user-123)
[Weaviate Entities] Found 3 matching entities
```

**Memory search logs**:
```
[MemoryRetrieval] Searching memories for: "migration"
[MemoryRetrieval] Found 5 matching memories
[MemoryRetrieval] Filtered to 2 memories above strength threshold 0.3
```

---

## Performance Benchmarks

### Expected Latency

| Operation | Expected Time |
|-----------|--------------|
| Entity Search | 50-100ms |
| Memory Search | 50-100ms |
| Parallel Retrieval | 100-150ms |
| Context Formatting | <10ms |
| Memory Refresh (async) | 10-20ms |
| **Total Context Retrieval** | **~150-200ms** |

### Optimization Tips

1. **Reduce context size** if latency is high
2. **Cache frequent queries** (future enhancement)
3. **Adjust BM25 parameters** for faster search
4. **Monitor Weaviate performance** (check cloud dashboard)

---

## Next Steps

### After Successful Test

1. **Monitor usage**: Check how often context is retrieved
2. **Analyze relevance**: Are responses using the context effectively?
3. **Adjust thresholds**: Fine-tune based on user feedback
4. **Add analytics**: Track context quality metrics

### Before Production

1. **Load test**: Verify performance under concurrent requests
2. **Error handling**: Test edge cases (no context, large context, etc.)
3. **Rate limiting**: Protect against excessive queries
4. **Monitoring**: Set up alerts for failures

---

## Support

### Documentation
- **Full Guide**: `CHAT-CONTEXT-INTEGRATION.md`
- **Summary**: `CHAT-INTEGRATION-SUMMARY.md`
- **This Guide**: `CHAT-QUICKSTART.md`

### Code Locations
- **Context Retrieval**: `src/lib/chat/context-retrieval.ts`
- **Context Formatter**: `src/lib/chat/context-formatter.ts`
- **Chat API**: `src/app/api/chat/route.ts`
- **Test Script**: `scripts/test-chat-context.ts`

### Key Functions
```typescript
// Retrieve context
import { retrieveContext } from '@/lib/chat';
const context = await retrieveContext(userId, message);

// Format for prompt
import { buildSystemPrompt } from '@/lib/chat';
const prompt = buildSystemPrompt(context, message);

// Refresh memories
import { refreshMemoryAccess } from '@/lib/memory/storage';
await refreshMemoryAccess(memoryId);
```

---

## Success Checklist

Before declaring integration complete, verify:

- [ ] Entities retrieved from Weaviate
- [ ] Memories retrieved from Weaviate
- [ ] Context formatted correctly
- [ ] System prompt includes context
- [ ] AI responses reference context
- [ ] Memory refresh working
- [ ] No TypeScript errors
- [ ] Test script passes
- [ ] Chat UI shows context in console
- [ ] Performance acceptable (<200ms)

---

**Ready to test!** Start with the standalone test script, then move to the full chat API integration.
