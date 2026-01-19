# Memory Persistence Flow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User Chat                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ "Call me Masa"
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Chat API Route                           │
│                  (src/app/api/chat/route.ts)                │
│                                                              │
│  1. Receive message                                         │
│  2. Build context (retrieve existing memories)              │
│  3. Send to LLM with system prompt                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      LLM (Claude)                           │
│                                                              │
│  Process with instructions:                                 │
│  - Detect preferences, facts, corrections                   │
│  - Include in memoriesToSave field                          │
│  - Set appropriate importance level                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Returns JSON
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Parse LLM Response                         │
│                                                              │
│  {                                                           │
│    "response": "I'll call you Masa from now on.",           │
│    "currentTask": null,                                     │
│    "memoriesToSave": [                                      │
│      {                                                       │
│        "category": "preference",                            │
│        "content": "User prefers to be called Masa",         │
│        "importance": 0.9,                                   │
│        "context": "Name preference"                         │
│      }                                                       │
│    ]                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Extract memoriesToSave
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Save Memories                            │
│              (src/lib/memory/storage.ts)                    │
│                                                              │
│  For each memory in memoriesToSave:                         │
│    - Add userId, sourceType='chat'                          │
│    - Add sourceId (chat session ID)                         │
│    - Add sourceDate (current timestamp)                     │
│    - Calculate decay rate based on category                 │
│    - Save to Weaviate                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Weaviate                               │
│                   (Memory Collection)                       │
│                                                              │
│  Stored with:                                               │
│  - Semantic vector embedding                                │
│  - Temporal decay parameters                                │
│  - Source tracking                                          │
│  - Related entities                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Retrieved in future conversations
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Context Retrieval                         │
│            (src/lib/chat/context-retrieval.ts)              │
│                                                              │
│  - Semantic search for relevant memories                    │
│  - Apply temporal decay                                     │
│  - Rank by relevance × strength                             │
│  - Include in chat context                                  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Example

### First Message: "Call me Masa"

```
User Input:
  "Call me Masa"

LLM Response:
  {
    "response": "Of course! I'll call you Masa from now on.",
    "currentTask": null,
    "memoriesToSave": [
      {
        "category": "preference",
        "content": "User prefers to be called Masa",
        "importance": 0.9,
        "context": "Name preference"
      }
    ]
  }

Saved to Weaviate:
  {
    "id": "uuid-1234",
    "userId": "user-abc",
    "content": "User prefers to be called Masa",
    "category": "preference",
    "sourceType": "chat",
    "sourceId": "session-xyz",
    "importance": 0.9,
    "decayRate": 0.01,  // Very slow decay for preferences
    "createdAt": "2024-01-18T10:30:00Z",
    "lastAccessed": "2024-01-18T10:30:00Z"
  }
```

### Second Message: "What's my name?"

```
User Input:
  "What's my name?"

Context Retrieval:
  Query: "What's my name?"
  Retrieved Memories:
    [
      {
        "content": "User prefers to be called Masa",
        "strength": 0.9,  // High importance, recent, slow decay
        "relevance": 0.95 // Very relevant to query
      }
    ]

LLM Context:
  System: "You are Izzie, Masa's personal assistant..."
  Context: "User prefers to be called Masa"
  User: "What's my name?"

LLM Response:
  {
    "response": "Your name is Masa!",
    "currentTask": null,
    "memoriesToSave": []  // No new memories to save
  }
```

## Memory Categories & Decay Rates

| Category     | Decay Rate | Default Importance | Example                              |
|--------------|------------|-------------------|--------------------------------------|
| preference   | 0.01       | 0.8               | "Prefers to be called Masa"          |
| fact         | 0.02       | 0.7               | "Works at Acme Corp"                 |
| relationship | 0.02       | 0.7               | "Friend of John Smith"               |
| decision     | 0.03       | 0.6               | "Chose React over Vue"               |
| event        | 0.05       | 0.5               | "Met with Sarah yesterday"           |
| sentiment    | 0.1        | 0.4               | "Frustrated with slow internet"      |
| reminder     | 0.2        | 0.6               | "Check email from boss"              |

## Importance Levels

| Level | Value | Use Case                                    |
|-------|-------|---------------------------------------------|
| High  | 0.9   | Name preferences, critical personal info    |
| Med   | 0.7   | General preferences, important facts        |
| Low   | 0.6   | Minor facts, general information            |

## Memory Strength Calculation

```typescript
strength = importance × decayFactor

decayFactor = e^(-decayRate × daysSinceAccess)

// Example: Preference memory after 30 days
importance = 0.9
decayRate = 0.01
daysSinceAccess = 30

decayFactor = e^(-0.01 × 30) = e^(-0.3) ≈ 0.74
strength = 0.9 × 0.74 = 0.67  // Still strong!
```

## Integration Points

1. **Chat API** → Saves memories from conversation
2. **Context Retrieval** → Retrieves memories for chat context
3. **Memory Storage** → Persists to Weaviate
4. **Semantic Search** → Finds relevant memories via embeddings
5. **Temporal Decay** → Ages memories appropriately
6. **Session Management** → Tracks source of memories

## Future Enhancements

- [ ] UI for viewing saved memories
- [ ] Memory editing/deletion interface
- [ ] Automatic deduplication
- [ ] Memory strength indicator
- [ ] Export/import functionality
- [ ] Memory confirmation notifications
- [ ] Smart memory consolidation
