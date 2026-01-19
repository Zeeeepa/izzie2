# Self-Awareness Context Implementation

## Overview

Implemented a self-awareness system for Izzie that provides her with accurate knowledge about her own architecture, capabilities, and connected data sources. This enables Izzie to accurately answer questions like "What can you do?", "How do you work?", or "What data sources are you connected to?"

## Implementation

### Files Created

1. **`/src/lib/chat/self-awareness.ts`** - Core self-awareness module
   - Defines `SelfAwarenessContext` interface with identity, architecture, connectors, and capabilities
   - `getSelfAwarenessContext(userId)` - Retrieves self-awareness context (currently static, can be made dynamic)
   - `formatSelfAwarenessForPrompt(context)` - Formats context for inclusion in system prompt

### Files Modified

1. **`/src/app/api/chat/route.ts`** - Chat API route
   - Added imports for self-awareness functions
   - Retrieves self-awareness context for each chat request
   - Includes formatted self-awareness in system prompt
   - Added instruction for Izzie to explain herself accurately

2. **`/src/lib/chat/index.ts`** - Chat module exports
   - Exported self-awareness functions and types for reusability

## Architecture Details

### Self-Awareness Context Structure

```typescript
{
  identity: {
    name: "Izzie",
    version: "1.0.0",
    description: "A personal AI assistant with memory and context awareness"
  },
  architecture: {
    contextWindow: "Sliding window with last 5 message pairs...",
    memorySystem: "Extracts memories with temporal decay...",
    entitySystem: "Extracts and tracks entities...",
    sessionManagement: "Maintains conversation sessions..."
  },
  connectors: [
    { name: "Gmail", type: "email", connected: true, ... },
    { name: "Google Calendar", type: "calendar", connected: true, ... },
    { name: "Google Drive", type: "storage", connected: true, ... },
    { name: "Weaviate", type: "database", connected: true, ... }
  ],
  capabilities: [
    "Remember facts, preferences, and context...",
    "Track people, companies, and projects...",
    ...
  ]
}
```

### System Prompt Integration

The self-awareness context is formatted and included in the system prompt:

```
You are Izzie, {userName}'s personal AI assistant...

## About Me (Izzie)

I am A personal AI assistant with memory and context awareness.

### My Architecture
- Context Window: Sliding window with last 5 message pairs...
- Memory System: Extracts memories with temporal decay...
- Entity System: Extracts and tracks entities...
- Session Management: Maintains conversation sessions...

### Connected Data Sources
- Gmail: Access to email messages...
- Google Calendar: Access to calendar events...
- Google Drive: Access to documents...
- Weaviate: Vector database for semantic search...

### What I Can Do
- Remember facts, preferences, and context...
- Track people, companies, and projects...
- Maintain conversation context...
...
```

## Benefits

1. **Accurate Self-Explanation**: Izzie can accurately explain her capabilities and architecture
2. **Transparency**: Users understand what data sources Izzie has access to
3. **Capability Discovery**: Users learn what Izzie can do for them
4. **Architecture Awareness**: Helps users understand how Izzie's memory and context systems work

## Future Enhancements

1. **Dynamic Connector Status**: Check actual database for connection status instead of static configuration
2. **User-Specific Capabilities**: Customize capabilities based on user's connected services
3. **Connection Health**: Include health status and last sync time for each connector
4. **Usage Statistics**: Include stats like "I've processed X emails, extracted Y entities"
5. **Personalization**: Include user-specific details like "I've been your assistant for X days"

## Testing

Test queries that should now work accurately:

1. "What can you do?"
2. "How do you work?"
3. "What data sources are you connected to?"
4. "Tell me about your architecture"
5. "How do you remember things?"
6. "What is your memory system?"
7. "How do you track people and companies?"

## Token Usage

- Self-awareness prompt: ~1,525 characters (~25 lines)
- Adds approximately 380-400 tokens to each chat request
- Acceptable overhead for improved self-explanation capability

## Related Documentation

- `/src/lib/chat/session/` - Session management and compression
- `/src/lib/chat/context-retrieval.ts` - Context retrieval from Weaviate
- `/src/lib/memory/` - Memory extraction and storage
- `/src/lib/entities/` - Entity extraction and tracking
