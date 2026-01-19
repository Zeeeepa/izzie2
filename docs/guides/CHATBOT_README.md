# Context-Aware Chatbot

A conversational AI assistant that queries extracted entities from your emails, calendar, and tasks.

## Features

### 1. Semantic Search
- Uses vector embeddings (text-embedding-3-small) for semantic search
- Finds relevant entities across all your data sources
- Cosine similarity threshold of 0.6 for broader matches

### 2. Streaming Responses
- Real-time AI responses using OpenRouter (Mistral or GPT models)
- Server-Sent Events (SSE) for smooth streaming
- Shows "Thinking..." indicator while processing

### 3. Entity Context
- Automatically retrieves relevant entities from database
- Groups entities by type (people, companies, projects, action items, etc.)
- Includes entity chips in responses for transparency
- Displays up to 10 entities per message

### 4. Conversation History
- Maintains last 5 messages for context
- Preserves conversation flow
- Clear chat button to start fresh

## Files Created

### 1. `/src/app/api/chat/route.ts` (Chat API)
**Purpose**: Backend API for chat processing

**Key Functions**:
- `generateEmbedding()`: Creates vector embeddings for semantic search
- `searchEntities()`: Finds relevant entities using vector similarity
- `buildContextPrompt()`: Constructs AI prompt with entity context
- `POST()`: Handles chat requests with streaming response

**Flow**:
1. Authenticate user
2. Generate embedding for user query
3. Search for similar memory entries (vector search)
4. Extract entities from memory metadata
5. Build context prompt with entities
6. Stream AI response back to client

**API Endpoint**: `POST /api/chat`

**Request**:
```json
{
  "message": "Who have I been emailing about the project?",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous response" }
  ]
}
```

**Response**: Server-Sent Events stream
```
data: {"delta": "I", "content": "I", "done": false, "entities": [...]}
data: {"delta": " found", "content": "I found", "done": false, "entities": [...]}
data: {"delta": "...", "content": "I found...", "done": true, "entities": [...]}
```

### 2. `/src/app/dashboard/chat/page.tsx` (Chat UI)
**Purpose**: User interface for chat interaction

**Key Features**:
- Clean chat interface with message bubbles
- Example queries for quick start
- Auto-scroll to latest message
- Entity chips showing referenced data
- Keyboard shortcuts (Enter to send, Shift+Enter for new line)
- Clear chat button
- Loading states and error handling

**UI Components**:
- Header with navigation
- Empty state with example queries
- Message list (user + assistant bubbles)
- Entity reference chips
- Input textarea with send button
- Error message display

## How to Test

### Prerequisites
1. **Database Setup**: Ensure you have extracted entities from emails/calendar
   - Run email sync: `/api/ingestion/sync-emails`
   - Run batch extraction: `/api/test/batch-extract`
   - Verify entities exist: `/api/entities`

2. **Environment Variables**: Check `.env.local`
   ```bash
   OPENAI_API_KEY=sk-...           # For embeddings
   OPENROUTER_API_KEY=sk-or-...    # For AI responses
   BETTER_AUTH_SECRET=...          # For authentication
   ```

3. **Authentication**: Sign in via Google OAuth
   - Visit `/login`
   - Authenticate with Google account

### Testing Steps

#### 1. Access Chat Page
```
http://localhost:3300/dashboard/chat
```

#### 2. Try Example Queries
Click any example query or type your own:

**People Queries**:
- "Who have I been emailing about the project?"
- "Who are the main people I've interacted with?"
- "Tell me about my communications with [person name]"

**Action Items**:
- "What action items do I have?"
- "What tasks am I assigned?"
- "What are my pending action items?"

**Calendar/Meetings**:
- "Tell me about my meetings this week"
- "What meetings do I have scheduled?"
- "Who am I meeting with today?"

**Companies**:
- "What companies have I interacted with?"
- "Which organizations have I been in contact with?"

**General**:
- "Summarize my recent communications"
- "What's important in my inbox?"
- "What should I focus on today?"

#### 3. Verify Features

**Streaming Response**:
- Watch for character-by-character streaming
- Should see "Thinking..." while waiting
- No delay between chunks

**Entity Context**:
- Check entity chips below AI responses
- Should show type and value
- Verify entities are relevant to query

**Conversation History**:
- Ask a follow-up question
- AI should understand context from previous messages
- Test with 5+ message conversation

**Error Handling**:
- Try without authentication (should redirect to login)
- Try with network disconnected (should show error)
- Try with empty message (send button disabled)

### Expected Behavior

#### Example Conversation

**User**: "Who have I been emailing about the project?"

**Assistant** (with entities):
```
Based on your recent emails, you've been communicating with:

- John Doe (john@example.com) - discussed project timeline and deliverables
- Jane Smith from Acme Corp - coordinated on implementation details
- Mike Johnson - reviewed technical specifications

These conversations appear to be related to [Project Name], with
focus on planning, execution, and coordination.

[Entity chips: person: John Doe, person: Jane Smith, company: Acme Corp]
```

**User**: "What did we discuss with Jane?"

**Assistant** (uses context from previous message):
```
In your communications with Jane Smith from Acme Corp, you discussed:

- Implementation timeline for the new feature
- Resource allocation and team structure
- Technical integration requirements
- Next steps and action items

The conversations suggest active collaboration on project delivery.

[Entity chips: person: Jane Smith, company: Acme Corp, topic: implementation]
```

### Debugging

#### Check API Logs
```bash
# Watch server logs
npm run dev

# Look for:
[Chat API] User <id> asked: "..."
[Chat API] Found X relevant memories
[Chat API] Extracted X unique entities
```

#### Check Network Tab
1. Open DevTools → Network
2. Send a message
3. Look for `/api/chat` request
4. Verify streaming response (SSE)
5. Check entity data in response

#### Check Database
```sql
-- Verify memory entries exist
SELECT COUNT(*) FROM memory_entries WHERE is_deleted = false;

-- Check entities in metadata
SELECT metadata->'entities' FROM memory_entries
WHERE metadata->>'entities' IS NOT NULL
LIMIT 5;

-- Test vector search
SELECT content, metadata->'entities'
FROM memory_entries
WHERE embedding IS NOT NULL
LIMIT 10;
```

## Technical Details

### Vector Search Flow
1. User query → OpenAI embedding (1536 dimensions)
2. Cosine similarity search in Postgres (pgvector)
3. Filter results by threshold (0.6)
4. Extract entities from metadata
5. Deduplicate by value
6. Return top 20 entities

### AI Model Selection
- **Embeddings**: `text-embedding-3-small` (OpenAI)
  - Cost: ~$0.00002 per query
  - Dimensions: 1536
  - Fast and accurate

- **Chat**: `MODELS.GENERAL` (from `@/lib/ai/models`)
  - Model: Mistral Medium or GPT-4 (configurable)
  - Temperature: 0.7 (balanced creativity)
  - Max tokens: 2000

### Performance
- **Embedding generation**: ~200ms
- **Vector search**: ~50-100ms (with pgvector index)
- **AI streaming**: Starts in ~1s, completes in 3-5s
- **Total response time**: ~5-7s for full answer

### Security
- Authentication required (Better Auth)
- User-scoped entity search (only your data)
- No PII in logs
- Secure token handling

## Troubleshooting

### No Entities Found
**Problem**: AI says "No relevant context found"

**Solutions**:
1. Check if entities exist: `GET /api/entities`
2. Run batch extraction: `POST /api/test/batch-extract`
3. Lower similarity threshold in `searchEntities()` (currently 0.6)
4. Check if embeddings exist in database

### Streaming Not Working
**Problem**: Full response appears at once instead of streaming

**Solutions**:
1. Check browser supports SSE (all modern browsers do)
2. Verify `Content-Type: text/event-stream` header
3. Check network tab for chunked transfer encoding
4. Ensure no caching middleware

### Authentication Errors
**Problem**: "Unauthorized" error

**Solutions**:
1. Sign in via `/login`
2. Check `BETTER_AUTH_SECRET` environment variable
3. Clear cookies and re-authenticate
4. Verify session table has active session

### AI Responses Too Generic
**Problem**: AI doesn't use entity context

**Solutions**:
1. Check entity extraction quality: `GET /api/entities?type=person`
2. Increase entity limit in `searchEntities()` (currently 20)
3. Adjust similarity threshold for more/fewer results
4. Verify `buildContextPrompt()` includes entities

## Future Enhancements

### Planned Features
- [ ] Conversation persistence (save/load chat history)
- [ ] Entity filtering by type in UI
- [ ] Export conversation as PDF/Markdown
- [ ] Voice input support
- [ ] Multi-user chat rooms
- [ ] Integration with calendar for meeting prep
- [ ] Smart suggestions based on context
- [ ] Email draft generation

### Performance Improvements
- [ ] Cache embeddings for common queries
- [ ] Batch embedding generation
- [ ] Pre-compute entity frequency scores
- [ ] Add Redis for conversation history
- [ ] Optimize vector index (HNSW instead of IVFFlat)

### UI Enhancements
- [ ] Message reactions
- [ ] Code block syntax highlighting
- [ ] Markdown formatting in messages
- [ ] Dark mode support
- [ ] Mobile-responsive design
- [ ] Accessibility improvements (ARIA labels)

## API Reference

### POST /api/chat

**Authentication**: Required (Better Auth session)

**Request Body**:
```typescript
{
  message: string;           // User's question
  history?: ChatMessage[];   // Conversation history (optional)
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

**Response**: Server-Sent Events stream

**Event Format**:
```typescript
{
  delta: string;              // New characters in this chunk
  content: string;            // Full content so far
  done: boolean;              // True when complete
  entities?: EntityContext[]; // Referenced entities
}

interface EntityContext {
  type: string;               // Entity type (person, company, etc.)
  value: string;              // Entity value (name, etc.)
  context?: string;           // Additional context
  source: string;             // Where entity was found
  emailContent?: string;      // Truncated email content
}
```

**Error Response**:
```json
{
  "error": "Error message",
  "details": "Detailed error description"
}
```

**Status Codes**:
- `200`: Success (streaming response)
- `400`: Invalid request (missing message)
- `401`: Unauthorized (not authenticated)
- `500`: Server error

## License

Same as parent project.
