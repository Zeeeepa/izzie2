# Chat System and Entity/Memory Integration Analysis

**Research Date**: January 17, 2026
**Project**: Izzie2 - AI Personal Assistant
**Focus**: Chat system architecture, entity storage, memory integration, and enhancement opportunities

---

## Executive Summary

Izzie2 has a **functional chat system** with entity retrieval capabilities, but there are **significant opportunities** to enhance it with better entity/memory integration. The current implementation uses a **hybrid approach** with pgvector for embeddings and Weaviate for structured entity storage, but these systems are not yet fully integrated with the chat experience.

**Key Findings:**
- ✅ Working chat API with streaming responses
- ✅ Weaviate entity storage with 7 entity types (Person, Company, Project, Date, Topic, Location, ActionItem)
- ✅ Memory system with pgvector (semantic search) + Neo4j (graph relationships)
- ⚠️ **Gap**: Chat currently uses old pgvector memory entries, not Weaviate entities
- ⚠️ **Gap**: No conversational memory persistence (loses context between sessions)
- ⚠️ **Gap**: No personalized user preferences or past conversation summaries

---

## 1. Current Chat System Architecture

### 1.1 Chat API Route (`/api/chat`)

**Location**: `src/app/api/chat/route.ts`

**Current Flow**:
```
User Message → Generate Embedding → Search memoryEntries (pgvector)
→ Extract entities from metadata → Build context prompt → Stream AI response
```

**Tech Stack**:
- **LLM**: Anthropic Claude Sonnet 4 via OpenRouter
- **Streaming**: Server-Sent Events (SSE)
- **Search**: pgvector semantic search (cosine similarity)
- **Entity Source**: Metadata from old memory entries (not Weaviate)

**API Contract**:
```typescript
// Request
POST /api/chat
{
  message: string;
  history?: ChatMessage[]; // Last 5 messages
}

// Response (SSE stream)
data: {
  delta: string;       // Chunk of response
  content: string;     // Full response so far
  done: boolean;       // Is streaming done?
  entities: EntityContext[]; // Top 10 entities for reference
}
```

### 1.2 Chat UI (`/dashboard/chat`)

**Location**: `src/app/dashboard/chat/page.tsx`

**Features**:
- Real-time streaming chat interface
- Message history (in-memory only, lost on refresh)
- Entity chips displayed with assistant responses
- Example queries for onboarding
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)

**UX Observations**:
- Clean, modern interface with good UX
- No conversation persistence (refreshing page loses history)
- No user preferences saved (e.g., preferred response style)
- No sidebar for past conversations

### 1.3 AI Model Configuration

**Location**: `src/lib/ai/models.ts`

**Model Tiers**:
1. **CHEAP** (Mistral Small 3.2): Classification, routing ($0.0001/1k input tokens)
2. **STANDARD** (Claude Sonnet 4): General chat ($0.003/1k input tokens)
3. **PREMIUM** (Claude Opus 4): Complex reasoning ($0.015/1k input tokens)

**Current Chat Usage**: Claude Sonnet 4 (standard tier)

---

## 2. Entity Storage (Weaviate)

### 2.1 Weaviate Schema

**Location**: `src/lib/weaviate/schema.ts`

**Collections** (7 entity types):

| Collection | Entity Type | Special Properties | Use Case |
|-----------|-------------|-------------------|----------|
| `Person` | person | - | People mentioned in emails/calendar |
| `Company` | company | - | Organizations and companies |
| `Project` | project | - | Project names and initiatives |
| `Date` | date | - | Deadlines and important dates |
| `Topic` | topic | - | Subjects and themes |
| `Location` | location | - | Physical locations |
| `ActionItem` | action_item | assignee, deadline, priority | Tasks and action items |

**Base Properties** (all collections):
```typescript
{
  value: string;           // Original entity value
  normalized: string;      // Normalized form (lowercase, underscored)
  confidence: number;      // 0-1 extraction confidence
  source: string;          // metadata, body, or subject
  sourceId: string;        // Email or event ID
  userId: string;          // User who owns this entity
  extractedAt: string;     // ISO timestamp
  context: string;         // Surrounding text
}
```

### 2.2 Entity Operations

**Location**: `src/lib/weaviate/entities.ts`

**Available Functions**:
- `saveEntities(entities, userId, sourceId)` - Batch insert entities
- `searchEntities(query, userId, options)` - BM25 keyword search (no vectorization needed!)
- `getEntitiesBySource(sourceId, userId)` - Get all entities from an email/event
- `deleteEntitiesBySource(sourceId, userId)` - Delete entities for a source
- `getEntityStats(userId)` - Count entities by type

**Search Capabilities**:
- **BM25 keyword search** (fast, no vector overhead)
- Filter by entity type
- Filter by confidence threshold
- User isolation (queries only return user's own entities)

**Example**:
```typescript
// Search for people named "John"
const people = await searchEntities('John', userId, {
  entityType: 'person',
  limit: 10,
  minConfidence: 0.8,
});

// Get all entities from an email
const entities = await getEntitiesBySource('email-123', userId);

// Stats: { person: 42, company: 15, project: 8, ... }
const stats = await getEntityStats(userId);
```

### 2.3 Extraction Pipeline

**Location**: `src/lib/extraction/entity-extractor.ts`

**Extraction Flow**:
```
Email/Calendar Event → AI Extraction (Claude Sonnet)
→ Post-filtering → Deduplication → User Identity Normalization
→ Save to Weaviate
```

**Entity Types Extracted**:
1. **Person**: Names from To/From/CC, body mentions
2. **Company**: Organizations and brands
3. **Project**: Project names and codenames
4. **Date**: Deadlines, meeting dates
5. **Topic**: Subjects and themes
6. **Location**: Physical locations
7. **Action Item**: Tasks with assignee/deadline/priority

**Quality Features**:
- Confidence scoring (0-1)
- Context capture (surrounding text)
- Spam filtering
- User identity detection (normalizes current user references)

---

## 3. Memory System

### 3.1 Memory Architecture

**Location**: `src/lib/memory/index.ts`

**Multi-Layer Design**:
```
┌─────────────────────────────────────────┐
│   Memory Service (Unified Interface)    │
├─────────────────────────────────────────┤
│  1. Mem0 (Graph relationships - Neo4j)  │
│  2. pgvector (Semantic search)          │
│  3. OpenAI Embeddings (text-embedding-3)│
└─────────────────────────────────────────┘
```

**Components**:
1. **Mem0 Client**: Manages graph relationships in Neo4j
2. **pgvector**: Stores embeddings in Neon Postgres
3. **Embedding Service**: Generates 1536-dim vectors (OpenAI)

### 3.2 Memory Operations

**Available Functions**:

```typescript
// Store memory with automatic embedding
await memoryService.store({
  userId: 'user-123',
  content: 'User prefers brief responses',
  metadata: { type: 'preference' }
}, {
  conversationId: 'conv-456',
  importance: 8,
  summary: 'User preference: brief responses'
});

// Semantic search
const memories = await memoryService.retrieve(
  userId,
  'What are my preferences?',
  { limit: 10, threshold: 0.7 }
);

// Hybrid search (vector + graph)
const result = await memoryService.hybridSearch(
  userId,
  'Tell me about John',
  { includeGraph: true }
);
```

### 3.3 Enhanced Memory Service

**Location**: `src/lib/memory/enhanced.ts`

**Additional Features**:
- Automatic entity extraction on memory store
- Persistence layer integration (dual-write coordination)
- Better error handling with rollback support
- Health monitoring

**Example**:
```typescript
// Stores memory + extracts entities automatically
const memory = await enhancedMemoryService.store({
  userId: 'user-123',
  content: 'Meeting with John about Project Alpha',
  metadata: { type: 'conversation_summary' }
}, {
  extractEntities: true, // Auto-extracts: Person(John), Project(Alpha)
  importance: 7
});
```

---

## 4. Gap Analysis

### 4.1 Current Limitations

#### **Chat System**
- ❌ Uses old memory entries (pgvector) instead of Weaviate entities
- ❌ No conversation persistence (history lost on refresh)
- ❌ No user preferences (response style, language, etc.)
- ❌ Limited to last 5 messages (no long-term conversation memory)
- ❌ No conversation summaries

#### **Entity Integration**
- ❌ Chat searches `memoryEntries` table, not Weaviate collections
- ❌ Entities in chat response are extracted from memory metadata (not Weaviate)
- ❌ No entity disambiguation ("John" could be multiple people)
- ❌ No entity relationship queries (e.g., "What projects is John working on?")

#### **Memory System**
- ❌ No conversation summaries stored
- ❌ No user preference tracking
- ❌ Memory search is separate from entity search (two queries)
- ❌ No hybrid ranking (vector + entity relevance)

### 4.2 Missing Features

**User-Requested Capabilities**:
1. **Entity-Enhanced Responses**
   - User asks: "Who is John?" → Should retrieve John's entity with context
   - User asks: "What's the status of Project Alpha?" → Should find project entity + related emails

2. **Conversation Memory**
   - Remember user's name, preferences, communication style
   - Reference past conversations: "Last time we talked about X..."
   - Maintain context across sessions

3. **Personalized Context**
   - User preferences (brief vs. detailed responses)
   - Important contacts (prioritize certain people/companies)
   - Active projects (filter entities by current projects)

---

## 5. Recommended Integration Approach

### 5.1 Architecture Design

**Proposed Flow**:
```
User Message
    ↓
1. Parse Intent & Entities
    ↓
2. Parallel Retrieval:
   ├── Weaviate Entity Search (BM25 keyword)
   ├── pgvector Memory Search (semantic)
   └── User Preferences (cached)
    ↓
3. Rank & Merge Results
    ↓
4. Build Enhanced Context
    ↓
5. Stream AI Response
    ↓
6. Store Conversation Summary
```

### 5.2 Key Enhancements

#### **Enhancement 1: Unified Search Function**

```typescript
// New: src/lib/chat/context-retrieval.ts
async function retrieveChatContext(
  userId: string,
  message: string,
  conversationId?: string
): Promise<ChatContext> {
  // Parallel retrieval
  const [weaviateEntities, memories, preferences] = await Promise.all([
    searchEntities(message, userId, { limit: 20 }), // Weaviate
    memoryService.retrieve(userId, message, {
      conversationId,
      limit: 10
    }), // pgvector
    getUserPreferences(userId), // Cache or DB
  ]);

  // Rank and merge
  const rankedResults = rankResults({
    entities: weaviateEntities,
    memories: memories,
    preferences: preferences,
    query: message,
  });

  return {
    entities: rankedResults.entities,
    memories: rankedResults.memories,
    preferences: preferences,
    conversationHistory: await getConversationHistory(conversationId),
  };
}
```

#### **Enhancement 2: Conversation Persistence**

```typescript
// New: src/lib/chat/conversations.ts
interface Conversation {
  id: string;
  userId: string;
  title: string; // Auto-generated from first message
  messages: ChatMessage[];
  summary?: string; // AI-generated summary
  createdAt: Date;
  updatedAt: Date;
}

// Store conversation after each message
await saveConversation({
  id: conversationId,
  userId: userId,
  messages: [...messages, newMessage],
  updatedAt: new Date(),
});

// Periodically summarize long conversations
if (messages.length % 10 === 0) {
  const summary = await summarizeConversation(messages);
  await updateConversationSummary(conversationId, summary);
}
```

#### **Enhancement 3: User Preferences**

```typescript
// New: src/lib/chat/preferences.ts
interface UserPreferences {
  userId: string;
  responseStyle: 'brief' | 'detailed' | 'conversational';
  language: string;
  timezone: string;
  priorityContacts: string[]; // Person entity IDs
  activeProjects: string[]; // Project entity IDs
  customInstructions?: string; // Free-form preferences
}

// Load preferences on chat init
const preferences = await getUserPreferences(userId);

// Include in system prompt
const systemPrompt = `
You are Izzie, an AI assistant for ${user.name}.

User preferences:
- Response style: ${preferences.responseStyle}
- Timezone: ${preferences.timezone}
${preferences.customInstructions ? `- Custom instructions: ${preferences.customInstructions}` : ''}
...
`;
```

#### **Enhancement 4: Entity Disambiguation**

```typescript
// When user mentions "John", check if multiple Johns exist
const johns = await searchEntities('John', userId, {
  entityType: 'person',
  minConfidence: 0.7,
});

if (johns.length > 1) {
  // Ask for clarification
  return {
    type: 'disambiguation',
    message: 'I found multiple people named John. Which one do you mean?',
    options: johns.map(j => ({
      id: j.normalized,
      label: j.value,
      context: j.context, // "John from Acme Corp"
    })),
  };
}
```

---

## 6. Implementation Plan

### Phase 1: Entity Integration (Week 1)

**Goal**: Replace memory entry search with Weaviate entity search

**Tasks**:
1. ✅ Create `src/lib/chat/context-retrieval.ts`
   - Implement unified search across Weaviate + pgvector
   - Rank and merge results

2. ✅ Update `/api/chat` route
   - Replace `searchEntities()` with new `retrieveChatContext()`
   - Include entity details in context prompt

3. ✅ Update chat UI
   - Display entity types more prominently
   - Add entity click handlers (view entity details)

**Success Metrics**:
- Chat responses reference Weaviate entities (not memory metadata)
- Entity chips show proper entity types
- Response quality improves (measurable via user feedback)

### Phase 2: Conversation Persistence (Week 2)

**Goal**: Save and restore conversation history

**Tasks**:
1. ✅ Create database schema
   - Add `conversations` table
   - Add `conversation_messages` table (or JSON column)

2. ✅ Implement conversation API
   - `POST /api/conversations` - Create new conversation
   - `GET /api/conversations/:id` - Load conversation
   - `GET /api/conversations` - List user's conversations
   - `DELETE /api/conversations/:id` - Delete conversation

3. ✅ Update chat UI
   - Add sidebar with conversation list
   - Auto-save conversations
   - Restore conversation on page load

**Success Metrics**:
- Conversations persist across sessions
- Users can navigate between past conversations
- No data loss on page refresh

### Phase 3: User Preferences (Week 3)

**Goal**: Personalize chat experience with user preferences

**Tasks**:
1. ✅ Create preferences schema
   - Add `user_preferences` table
   - Define preference structure

2. ✅ Implement preferences UI
   - Add settings page (`/dashboard/settings`)
   - Form for response style, timezone, custom instructions

3. ✅ Integrate preferences into chat
   - Load preferences on chat init
   - Include in system prompt
   - Update responses based on style preference

**Success Metrics**:
- Users can set preferences
- Responses reflect user's preferred style
- Preferences persist across sessions

### Phase 4: Advanced Features (Week 4+)

**Goal**: Entity relationships, conversation summaries, smart suggestions

**Tasks**:
1. ✅ Entity relationship queries
   - "What projects is John working on?"
   - "Who works at Acme Corp?"

2. ✅ Conversation summaries
   - Auto-summarize long conversations
   - Store summaries as memories

3. ✅ Smart suggestions
   - Suggest related entities
   - Suggest follow-up questions

4. ✅ Entity disambiguation
   - Detect ambiguous entities
   - Ask for clarification

**Success Metrics**:
- Complex entity queries work correctly
- Conversation summaries are accurate
- Users engage with suggestions

---

## 7. Technical Requirements

### 7.1 New Database Tables

**Conversations Table**:
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
```

**Conversation Messages Table** (Option 1: Separate table):
```sql
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  entities JSONB, -- Entity references
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
```

**User Preferences Table**:
```sql
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  response_style TEXT DEFAULT 'conversational',
  language TEXT DEFAULT 'en',
  timezone TEXT DEFAULT 'UTC',
  priority_contacts TEXT[], -- Person entity normalized names
  active_projects TEXT[], -- Project entity normalized names
  custom_instructions TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 7.2 New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/conversations` | GET | List user's conversations |
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations/:id` | GET | Get conversation with messages |
| `/api/conversations/:id` | PATCH | Update conversation (title, summary) |
| `/api/conversations/:id` | DELETE | Delete conversation |
| `/api/preferences` | GET | Get user preferences |
| `/api/preferences` | PUT | Update user preferences |
| `/api/entities/search` | POST | Unified entity search |
| `/api/entities/:id` | GET | Get entity details |

### 7.3 New Library Modules

**Context Retrieval** (`src/lib/chat/context-retrieval.ts`):
- Unified search across Weaviate + pgvector
- Result ranking and merging
- Entity disambiguation

**Conversation Manager** (`src/lib/chat/conversations.ts`):
- CRUD operations for conversations
- Auto-summarization
- Message storage and retrieval

**Preferences Manager** (`src/lib/chat/preferences.ts`):
- Load/save user preferences
- Validate preferences
- Apply preferences to chat context

**Entity Query Engine** (`src/lib/chat/entity-queries.ts`):
- Parse entity relationship queries
- Execute multi-hop entity searches
- Format entity results for chat

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Context Retrieval**:
- Test entity search
- Test memory search
- Test result ranking
- Test entity disambiguation

**Conversation Manager**:
- Test CRUD operations
- Test auto-summarization
- Test message pagination

**Preferences Manager**:
- Test preference validation
- Test preference application to prompts

### 8.2 Integration Tests

**Chat Flow**:
- Test end-to-end chat with entity integration
- Test conversation persistence
- Test preference application
- Test entity relationship queries

**API Routes**:
- Test all CRUD endpoints
- Test error handling
- Test authentication

### 8.3 User Acceptance Testing

**Scenarios**:
1. User asks "Who is John?" → Retrieves correct entity with context
2. User refreshes page → Conversation history restored
3. User sets preference "brief responses" → Responses are concise
4. User asks "What projects is John working on?" → Shows related entities

---

## 9. Performance Considerations

### 9.1 Query Optimization

**Current Performance**:
- pgvector search: ~50-100ms (semantic search)
- Weaviate BM25: ~20-50ms (keyword search)
- Total context retrieval: ~100-150ms

**Optimizations**:
1. **Parallel queries**: Run Weaviate + pgvector in parallel (already done in proposal)
2. **Caching**: Cache user preferences (Redis or in-memory)
3. **Pagination**: Limit entity results to top 20
4. **Debouncing**: Debounce typing to reduce queries

### 9.2 Cost Tracking

**Current Chat Cost**:
- Claude Sonnet 4: ~$0.003/1k input tokens
- Average message: ~500 tokens input, 300 tokens output
- Cost per message: ~$0.006

**With Enhanced Context**:
- Additional context: ~1000 tokens (entities + memories)
- Cost per message: ~$0.009
- **50% cost increase** (acceptable for better quality)

### 9.3 Scalability

**Concurrent Users**:
- Target: 100 concurrent users
- pgvector can handle 1000+ QPS
- Weaviate can handle 5000+ QPS
- Bottleneck: AI streaming (rate limits)

**Mitigation**:
- Queue messages if rate limited
- Implement request pooling
- Add caching layer for common queries

---

## 10. Risks and Mitigations

### 10.1 Data Privacy

**Risk**: User conversations contain sensitive information

**Mitigation**:
- Encrypt conversations at rest (database-level encryption)
- Implement auto-delete after X days (user-configurable)
- Add "incognito mode" (no conversation storage)

### 10.2 Entity Disambiguation Failures

**Risk**: Multiple entities with same name, wrong one selected

**Mitigation**:
- Show disambiguation UI when multiple matches found
- Use context to score entity relevance
- Allow user to correct entity references

### 10.3 Memory Bloat

**Risk**: Storing full conversations for all users increases storage costs

**Mitigation**:
- Implement conversation summarization (store summaries, not full text)
- Auto-archive old conversations (>30 days)
- Limit message history to last 50 messages

---

## 11. Success Metrics

### 11.1 User Engagement

- **Conversation length**: Average messages per conversation
- **Return rate**: % of users who return to past conversations
- **Entity clicks**: % of messages where users click entity chips

**Targets**:
- Average conversation length: >10 messages
- Return rate: >30% of users
- Entity click rate: >15% of messages

### 11.2 Quality Metrics

- **Response accuracy**: User ratings (thumbs up/down)
- **Entity relevance**: % of messages with relevant entities
- **Disambiguation success**: % of ambiguous queries resolved correctly

**Targets**:
- Response accuracy: >80% positive ratings
- Entity relevance: >70% of messages
- Disambiguation success: >90% correct

### 11.3 Performance Metrics

- **Response latency**: Time to first token
- **Query latency**: Context retrieval time
- **Error rate**: % of failed requests

**Targets**:
- Response latency: <500ms
- Query latency: <200ms
- Error rate: <1%

---

## 12. Conclusion

Izzie2 has a **solid foundation** for an intelligent chat assistant with entity and memory integration. The current system has:

✅ **Working Components**:
- Chat API with streaming
- Weaviate entity storage (7 types)
- Memory system with pgvector + Neo4j
- Clean, modern UI

⚠️ **Key Gaps**:
- Chat uses old memory entries, not Weaviate entities
- No conversation persistence
- No user preferences
- Limited entity integration

**Recommended Next Steps**:
1. **Week 1**: Integrate Weaviate entities into chat context retrieval
2. **Week 2**: Implement conversation persistence
3. **Week 3**: Add user preferences
4. **Week 4+**: Advanced features (entity relationships, summaries)

**Estimated Effort**: 4-6 weeks for full implementation

**Risk Level**: Low (incremental enhancements, no breaking changes)

---

## Appendix A: Code Examples

### Example 1: Enhanced Chat Context Retrieval

```typescript
// src/lib/chat/context-retrieval.ts
import { searchEntities } from '@/lib/weaviate';
import { memoryService } from '@/lib/memory';
import { getUserPreferences } from './preferences';

export async function retrieveChatContext(
  userId: string,
  message: string,
  conversationId?: string
) {
  // Parallel retrieval
  const [entities, memories, preferences] = await Promise.all([
    searchEntities(message, userId, {
      limit: 20,
      minConfidence: 0.7,
    }),
    memoryService.retrieve(userId, message, {
      conversationId,
      limit: 10,
      threshold: 0.7,
    }),
    getUserPreferences(userId),
  ]);

  // Rank by relevance (simple weighted score)
  const rankedEntities = entities.map(e => ({
    ...e,
    score: e.confidence, // Could add more factors
  })).sort((a, b) => b.score - a.score);

  return {
    entities: rankedEntities.slice(0, 10),
    memories: memories.slice(0, 5),
    preferences,
  };
}
```

### Example 2: Conversation Persistence

```typescript
// src/lib/chat/conversations.ts
import { dbClient } from '@/lib/db';
import { conversations, conversationMessages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function saveConversation(data: {
  id: string;
  userId: string;
  title?: string;
  messages: ChatMessage[];
}) {
  // Upsert conversation
  await dbClient
    .insert(conversations)
    .values({
      id: data.id,
      userId: data.userId,
      title: data.title || generateTitle(data.messages[0]?.content),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: conversations.id,
      set: {
        title: data.title || generateTitle(data.messages[0]?.content),
        updatedAt: new Date(),
      },
    });

  // Insert new messages (skip existing)
  for (const message of data.messages) {
    await dbClient
      .insert(conversationMessages)
      .values({
        conversationId: data.id,
        role: message.role,
        content: message.content,
        entities: message.entities || null,
        createdAt: message.timestamp,
      })
      .onConflictDoNothing();
  }
}

export async function loadConversation(conversationId: string) {
  const [conversation] = await dbClient
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));

  if (!conversation) return null;

  const messages = await dbClient
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(conversationMessages.createdAt);

  return {
    ...conversation,
    messages,
  };
}

function generateTitle(firstMessage: string): string {
  // Take first 50 chars or first sentence
  const title = firstMessage.substring(0, 50);
  return title.includes('.')
    ? title.substring(0, title.indexOf('.'))
    : title + '...';
}
```

### Example 3: Enhanced Chat API

```typescript
// src/app/api/chat/route.ts (updated)
import { retrieveChatContext } from '@/lib/chat/context-retrieval';
import { saveConversation } from '@/lib/chat/conversations';

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  const { message, history, conversationId } = await request.json();

  // NEW: Retrieve enhanced context
  const context = await retrieveChatContext(
    session.user.id,
    message,
    conversationId
  );

  // Build enhanced prompt with entities, memories, and preferences
  const systemPrompt = buildEnhancedPrompt(context, message);

  // Stream AI response (existing code)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  const aiClient = getAIClient();
  const stream = /* ... existing streaming code ... */;

  // NEW: Save conversation after streaming completes
  await saveConversation({
    id: conversationId,
    userId: session.user.id,
    messages: [...history,
      { role: 'user', content: message },
      { role: 'assistant', content: responseContent },
    ],
  });

  return new Response(stream, { /* ... */ });
}

function buildEnhancedPrompt(context: ChatContext, query: string): string {
  const { entities, memories, preferences } = context;

  // Group entities by type
  const entitiesByType = entities.reduce((acc, e) => {
    if (!acc[e.type]) acc[e.type] = [];
    acc[e.type].push(e);
    return acc;
  }, {} as Record<string, Entity[]>);

  const entitySections = Object.entries(entitiesByType).map(([type, items]) => {
    const list = items.map(e =>
      `  - ${e.value}${e.context ? ` (${e.context})` : ''}`
    ).join('\n');
    return `${type.toUpperCase()}:\n${list}`;
  }).join('\n\n');

  return `You are Izzie, an AI assistant for the user.

User preferences:
- Response style: ${preferences?.responseStyle || 'conversational'}
- Timezone: ${preferences?.timezone || 'UTC'}
${preferences?.customInstructions ? `- Custom instructions: ${preferences.customInstructions}` : ''}

Relevant context from the user's data:

${entitySections}

Recent memories:
${memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n')}

User query: ${query}

Provide a helpful, ${preferences?.responseStyle || 'conversational'} response based on the context above. Reference specific entities when relevant.`;
}
```

---

## Appendix B: Database Schema

```sql
-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- Conversation Messages
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  entities JSONB, -- [{ type: 'person', value: 'John' }, ...]
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);

-- User Preferences
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  response_style TEXT DEFAULT 'conversational' CHECK (response_style IN ('brief', 'detailed', 'conversational')),
  language TEXT DEFAULT 'en',
  timezone TEXT DEFAULT 'UTC',
  priority_contacts TEXT[], -- ['john_doe', 'jane_smith']
  active_projects TEXT[], -- ['project_alpha', 'project_beta']
  custom_instructions TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

**End of Analysis**

**Next Actions**:
1. Review this analysis with the team
2. Prioritize phases based on business needs
3. Create tickets for Phase 1 implementation
4. Set up testing environment
5. Begin development on Week 1 tasks
