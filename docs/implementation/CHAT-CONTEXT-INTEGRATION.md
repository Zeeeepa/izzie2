# Chat Context Integration

## Overview

The chat API now integrates both **entities** and **memories** for personalized, context-aware responses. When a user asks a question, the system:

1. Searches for relevant entities (people, companies, projects, etc.)
2. Retrieves relevant memories with temporal decay filtering
3. Formats context into a structured prompt
4. Generates a personalized AI response
5. Refreshes accessed memories to slow decay

## Architecture

### Components

#### 1. Context Retrieval (`src/lib/chat/context-retrieval.ts`)

**Purpose**: Retrieve relevant entities and memories based on user message.

**Key Functions**:
- `extractQueryTerms(message)` - Extract search terms from user message
- `retrieveContext(userId, message, options)` - Fetch entities and memories in parallel
- `summarizeContext(context)` - Create debugging summary

**Process**:
```typescript
const context = await retrieveContext(userId, message, history, {
  maxEntities: 10,
  maxMemories: 10,
  minMemoryStrength: 0.3, // Include moderately decayed memories
});
```

**Returns**:
```typescript
interface ChatContext {
  entities: Entity[];           // From Weaviate (people, companies, projects, etc.)
  memories: MemoryWithStrength[];  // From Weaviate (preferences, facts, events, etc.)
  recentConversation?: ChatMessage[];  // Optional conversation history
}
```

#### 2. Context Formatter (`src/lib/chat/context-formatter.ts`)

**Purpose**: Format retrieved context into readable, prompt-friendly structure.

**Key Functions**:
- `formatContextForPrompt(context)` - Convert context to structured markdown
- `buildSystemPrompt(context, message)` - Create complete system prompt with instructions
- `formatContextSummary(context)` - Compact summary for logging

**Output Format**:
```markdown
## Relevant Context

### People
  - John Smith (CEO at Acme Corp)
  - Sarah Developer (works on Project Alpha)

### Projects
  - Project Alpha - frontend rewrite
  - Database Migration - starts Monday

### Your Preferences
  - You prefer morning meetings (recent)
  - You use PostgreSQL for databases

### Recent Events
  - Q4 planning starts next week
  - Team decided to use React for frontend
```

#### 3. Updated Chat API (`src/app/api/chat/route.ts`)

**Changes**:
- Replaced old entity search with unified context retrieval
- Added memory retrieval with decay filtering
- Added memory access refresh (updates `lastAccessed` timestamp)
- Enhanced context metadata in streaming response

**Flow**:
```typescript
POST /api/chat
  ↓
1. Authenticate user
  ↓
2. Retrieve context (entities + memories in parallel)
  ↓
3. Format context into system prompt
  ↓
4. Build chat messages with context
  ↓
5. Stream AI response
  ↓
6. Refresh accessed memories (top 5)
```

## Integration Points

### Weaviate Entity Search
- **Location**: `src/lib/weaviate/entities.ts`
- **Function**: `searchEntities(query, userId, options)`
- **Search Method**: BM25 keyword search (no vectorizer needed)
- **Filters**: userId, entityType, minConfidence

### Weaviate Memory Search
- **Location**: `src/lib/memory/retrieval.ts`
- **Function**: `searchMemories(options)`
- **Search Method**: BM25 keyword search
- **Filters**: userId, categories, minStrength, tags, sourceType

### Memory Decay
- **Location**: `src/lib/memory/decay.ts`
- **Function**: `calculateMemoryStrength(memory)`
- **Formula**: `strength = exp(-effectiveDecayRate * daysSinceAccess)`
- **Effect**: High importance memories decay slower

### Memory Refresh
- **Location**: `src/lib/memory/storage.ts`
- **Function**: `refreshMemoryAccess(memoryId)`
- **Effect**: Updates `lastAccessed` timestamp, resets decay clock

## Usage Examples

### Example 1: Project Status Query

**User**: "What's happening with the database migration?"

**Context Retrieved**:
- Entities: Project "Database Migration", Person "Sarah Developer"
- Memories: "Database migration starts Monday", "Team decided to use PostgreSQL"

**Response**: References project details, timeline, and team decisions naturally.

---

### Example 2: Meeting Scheduling

**User**: "When should I schedule the meeting with John?"

**Context Retrieved**:
- Entities: Person "John Smith (CEO at Acme Corp)"
- Memories: "You prefer morning meetings", "John is available Tuesdays and Thursdays"

**Response**: Suggests morning meeting on Tuesday or Thursday based on preferences.

---

### Example 3: Action Items

**User**: "What are my upcoming tasks?"

**Context Retrieved**:
- Entities: Action items with deadlines and priorities
- Memories: Recent reminders and decisions

**Response**: Lists action items with context, deadlines, and priorities.

---

## Configuration Options

### Context Retrieval Options

```typescript
interface ContextRetrievalOptions {
  maxEntities?: number;        // Default: 10
  maxMemories?: number;        // Default: 10
  minMemoryStrength?: number;  // Default: 0.3 (include moderately decayed)
  entityTypes?: EntityType[];  // Filter by entity type
  memoryCategories?: MemoryCategory[];  // Filter by memory category
  includeRecentMessages?: boolean;  // Include conversation history
}
```

### Entity Types
- `person` - People (contacts, colleagues)
- `company` - Companies and organizations
- `project` - Projects and initiatives
- `date` - Important dates and deadlines
- `topic` - Topics and subjects
- `location` - Locations
- `action_item` - Tasks and action items

### Memory Categories
- `preference` - User preferences and habits (slow decay)
- `fact` - Objective facts (slow decay)
- `event` - Events (medium decay)
- `decision` - Decisions (medium decay)
- `sentiment` - Emotional context (fast decay)
- `reminder` - Reminders (very fast decay)
- `relationship` - How entities relate (slow decay)

## Testing

### Manual Test (Chat UI)

1. Navigate to chat interface
2. Ask: "What's happening with [project name]?"
3. Verify response includes relevant entities and memories
4. Check console logs for context summary

### Script Test

```bash
# Test context retrieval with sample queries
npx tsx scripts/test-chat-context.ts
```

### Expected Output

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

## Performance Considerations

### Parallel Retrieval
- Entities and memories fetched in parallel for speed
- Typical latency: 100-300ms for both queries combined

### Context Limits
- Default: 10 entities + 10 memories
- Keeps prompt size manageable (~1000-2000 tokens)
- Prevents token overflow in AI requests

### Memory Refresh Strategy
- Only top 5 most relevant memories refreshed per query
- Prevents excessive database writes
- Balances decay accuracy with performance

## Memory Decay Behavior

### Strength Calculation

```
strength = exp(-effectiveDecayRate * daysSinceAccess)
effectiveDecayRate = decayRate * (1 - importance * 0.5)
```

**Examples**:

| Memory Type | Importance | Decay Rate | Half-Life |
|-------------|-----------|------------|-----------|
| Preference  | 0.8       | 0.01       | ~116 days |
| Fact        | 0.7       | 0.02       | ~48 days  |
| Event       | 0.5       | 0.05       | ~14 days  |
| Reminder    | 0.6       | 0.2        | ~4 days   |

### Access Refresh Effect

When a memory is accessed:
- `lastAccessed` timestamp updated to now
- Decay clock resets
- Strength boosted back toward 1.0
- Memory becomes more relevant for future queries

**Example**: A 30-day-old preference memory with strength 0.7 gets accessed:
- Before: `strength = 0.7` (decaying)
- After refresh: `strength ≈ 0.98` (fresh again)

## Troubleshooting

### No Context Retrieved

**Problem**: Chat returns "No relevant context found"

**Solutions**:
- Verify entities and memories exist in Weaviate
- Check user ID matches
- Lower `minMemoryStrength` threshold (try 0.1)
- Check query terms extraction (see logs)

### Poor Context Relevance

**Problem**: Retrieved context not relevant to query

**Solutions**:
- Improve entity extraction quality
- Add more specific memories
- Use tags and related entities for better linking
- Adjust BM25 search parameters

### Context Too Large

**Problem**: System prompt exceeds token limits

**Solutions**:
- Reduce `maxEntities` and `maxMemories`
- Increase `minMemoryStrength` threshold
- Filter by specific entity types or memory categories

## Future Enhancements

### Planned Improvements

1. **Semantic Search**: Replace BM25 with vector similarity search for better relevance
2. **Conversation Memory**: Store chat interactions as memories for continuity
3. **Context Ranking**: Use ML model to rank context by relevance
4. **Adaptive Thresholds**: Adjust memory strength threshold based on context availability
5. **Entity Refresh**: Update entity `lastAccessed` timestamp (similar to memories)

### Migration Path

Current: BM25 keyword search
→ Hybrid: BM25 + vector similarity
→ Future: Pure semantic search with reranking

## API Reference

### retrieveContext

```typescript
async function retrieveContext(
  userId: string,
  message: string,
  recentMessages?: ChatMessage[],
  options?: ContextRetrievalOptions
): Promise<ChatContext>
```

### buildSystemPrompt

```typescript
function buildSystemPrompt(
  context: ChatContext,
  userMessage: string
): string
```

### formatContextSummary

```typescript
function formatContextSummary(
  context: ChatContext
): string
```

## Summary

The chat API now provides **personalized, context-aware responses** by integrating:

✅ **Entity Retrieval** - People, companies, projects, dates, topics, locations, action items
✅ **Memory Retrieval** - Preferences, facts, events, decisions, relationships
✅ **Temporal Decay** - Recent and frequently accessed information prioritized
✅ **Access Refresh** - Memories strengthen with use
✅ **Structured Formatting** - Clean, readable context for AI

Users experience responses that reference their personal information naturally and accurately.
