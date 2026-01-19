# Self-Awareness Reference Guide

## Quick Overview

Izzie now has accurate knowledge about her architecture, capabilities, and connected data sources. This enables her to answer meta-questions accurately.

## API Reference

### `getSelfAwarenessContext(userId: string): Promise<SelfAwarenessContext>`

Retrieves the self-awareness context for a user.

**Parameters:**
- `userId` - The user ID (currently unused, for future user-specific context)

**Returns:**
```typescript
{
  identity: {
    name: string;
    version: string;
    description: string;
  };
  architecture: {
    contextWindow: string;
    memorySystem: string;
    entitySystem: string;
    sessionManagement: string;
  };
  connectors: ConnectorStatus[];
  capabilities: string[];
}
```

**Example:**
```typescript
const context = await getSelfAwarenessContext(userId);
console.log(context.identity.name); // "Izzie"
console.log(context.connectors.length); // 4
```

### `formatSelfAwarenessForPrompt(context: SelfAwarenessContext): string`

Formats self-awareness context for inclusion in the system prompt.

**Parameters:**
- `context` - The self-awareness context from `getSelfAwarenessContext()`

**Returns:**
- Formatted markdown string suitable for system prompt

**Example:**
```typescript
const context = await getSelfAwarenessContext(userId);
const prompt = formatSelfAwarenessForPrompt(context);
// Returns formatted markdown with architecture, connectors, capabilities
```

## Types Reference

### `SelfAwarenessContext`

```typescript
interface SelfAwarenessContext {
  identity: {
    name: string;
    version: string;
    description: string;
  };
  architecture: {
    contextWindow: string;
    memorySystem: string;
    entitySystem: string;
    sessionManagement: string;
  };
  connectors: ConnectorStatus[];
  capabilities: string[];
}
```

### `ConnectorStatus`

```typescript
interface ConnectorStatus {
  name: string;
  type: 'email' | 'calendar' | 'storage' | 'database';
  connected: boolean;
  description: string;
  capabilities: string[];
}
```

## Current Configuration

### Identity
- **Name:** Izzie
- **Version:** 1.0.0
- **Description:** A personal AI assistant with memory and context awareness

### Architecture

**Context Window:**
- Sliding window with last 5 message pairs kept verbatim
- Older messages compressed into summaries

**Memory System:**
- Extracts memories (facts, preferences, events, decisions, sentiments, reminders, relationships)
- Temporal decay - frequently accessed memories stay relevant longer

**Entity System:**
- Extracts and tracks entities (people, companies, projects, topics, locations, action items, dates)
- Deduplication and user identity awareness

**Session Management:**
- Maintains conversation sessions
- Current task tracking
- Compressed history
- Context retrieval from Weaviate vector database

### Connected Data Sources

1. **Gmail** (email)
   - Read email content and metadata
   - Extract entities (people, companies, projects)
   - Extract memories (facts, preferences, events)
   - Track communication patterns

2. **Google Calendar** (calendar)
   - Read upcoming events
   - Extract meeting participants
   - Track scheduling patterns

3. **Google Drive** (storage)
   - Read document content
   - Extract topics and projects
   - Track document activity

4. **Weaviate** (database)
   - Semantic search across all extracted data
   - Fast retrieval of relevant context
   - Decay-weighted memory ranking

### Capabilities

1. Remember facts, preferences, and context from your emails and documents
2. Track people, companies, and projects you interact with
3. Maintain conversation context across long sessions
4. Track your current task and help you stay focused
5. Search semantically across all your connected data
6. Learn your preferences and communication patterns over time

## Usage in Chat API

```typescript
import { getSelfAwarenessContext, formatSelfAwarenessForPrompt } from '@/lib/chat';

// In chat route handler
const selfAwareness = await getSelfAwarenessContext(userId);
const selfAwarenessPrompt = formatSelfAwarenessForPrompt(selfAwareness);

const systemPrompt = `You are Izzie, ${userName}'s assistant...
${selfAwarenessPrompt}
...`;
```

## Test Scenarios

### User Asks About Capabilities
**User:** "What can you do?"

**Expected Response:** Izzie lists her 6 capabilities accurately, mentioning connected data sources.

### User Asks About Architecture
**User:** "How do you work?"

**Expected Response:** Izzie explains her architecture components (context window, memory system, entity system, session management).

### User Asks About Data Sources
**User:** "What data sources are you connected to?"

**Expected Response:** Izzie lists Gmail, Google Calendar, Google Drive, and Weaviate with descriptions.

### User Asks About Memory
**User:** "How do you remember things?"

**Expected Response:** Izzie explains memory system with temporal decay and frequent access patterns.

## Modification Guide

### Adding a New Connector

```typescript
// In src/lib/chat/self-awareness.ts
connectors: [
  // ... existing connectors
  {
    name: 'Slack',
    type: 'communication', // Add new type if needed
    connected: true,
    description: 'Access to Slack messages and channels',
    capabilities: [
      'Read channel messages',
      'Extract team discussions',
      'Track project conversations',
    ],
  },
]
```

### Adding a New Capability

```typescript
capabilities: [
  // ... existing capabilities
  'Generate insights from your communication patterns',
]
```

### Making Connectors Dynamic

```typescript
export async function getSelfAwarenessContext(userId: string): Promise<SelfAwarenessContext> {
  // Check database for actual connection status
  const gmailConnected = await checkGmailConnection(userId);
  const calendarConnected = await checkCalendarConnection(userId);

  return {
    // ... identity and architecture
    connectors: [
      {
        name: 'Gmail',
        type: 'email',
        connected: gmailConnected, // Dynamic status
        // ...
      },
      // ...
    ],
    // ...
  };
}
```

## Performance Considerations

### Token Usage
- Self-awareness prompt: ~380-400 tokens
- Added to every chat request
- Consider lazy loading for optimization

### Lazy Loading Pattern

```typescript
// Only include self-awareness for meta-questions
const isMetaQuestion = detectMetaQuestion(message);
const selfAwarenessPrompt = isMetaQuestion
  ? formatSelfAwarenessForPrompt(await getSelfAwarenessContext(userId))
  : '';
```

### Caching Pattern

```typescript
// Cache self-awareness context (it's mostly static)
const cache = new Map<string, SelfAwarenessContext>();

export async function getSelfAwarenessContext(userId: string): Promise<SelfAwarenessContext> {
  if (cache.has(userId)) {
    return cache.get(userId)!;
  }

  const context = { /* ... build context ... */ };
  cache.set(userId, context);
  return context;
}
```

## Related Documentation

- `/src/lib/chat/session/` - Session management
- `/src/lib/chat/context-retrieval.ts` - Context retrieval from Weaviate
- `/src/lib/memory/` - Memory extraction and storage
- `/src/lib/entities/` - Entity extraction and tracking
- `SELF-AWARENESS-IMPLEMENTATION.md` - Implementation details
- `docs/self-awareness-flow.md` - Flow diagrams
