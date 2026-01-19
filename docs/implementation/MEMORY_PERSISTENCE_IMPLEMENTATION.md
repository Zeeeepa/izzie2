# Memory Persistence from Chat - Implementation Summary

## Problem
User said "Call me Masa" but Izzie didn't persist this as a memory, so the next message still called them "Robert". The chat system needed the ability to save memories from conversations.

## Solution
Added memory persistence capability to chat conversations. When users share preferences, facts, or corrections, Izzie now saves them as memories that persist across sessions.

## Changes Made

### 1. Updated Type Definitions (`src/lib/chat/session/types.ts`)

**Added new interface for memories:**
```typescript
export interface MemoryToSave {
  category: 'preference' | 'fact' | 'event' | 'decision' | 'sentiment' | 'reminder' | 'relationship';
  content: string;
  importance: number; // 0.0-1.0
  context?: string;
}
```

**Updated StructuredLLMResponse:**
```typescript
export interface StructuredLLMResponse {
  response: string;
  currentTask: CurrentTask | null;
  updatedCompressedHistory?: string;
  memoriesToSave?: MemoryToSave[]; // NEW
}
```

**Updated RESPONSE_FORMAT_INSTRUCTION:**
- Added `memoriesToSave` field to JSON response format
- Added guidelines for when to save memories
- Added importance level guidance:
  - 0.9: High - Name preferences, critical personal information
  - 0.7: Medium - General preferences, important facts
  - 0.6: Low - Minor facts, general information
- Added examples of common memory types

### 2. Updated Chat API Route (`src/app/api/chat/route.ts`)

**Added memory parsing:**
```typescript
const parsed = JSON.parse(jsonContent);
structuredResponse = {
  response: parsed.response || fullContent,
  currentTask: parsed.currentTask || null,
  memoriesToSave: parsed.memoriesToSave, // NEW
};
```

**Added memory saving logic:**
```typescript
// Save any memories from the response
if (structuredResponse.memoriesToSave && structuredResponse.memoriesToSave.length > 0) {
  const { saveMemory } = await import('@/lib/memory/storage');

  for (const mem of structuredResponse.memoriesToSave) {
    try {
      await saveMemory({
        userId,
        category: mem.category,
        content: mem.content,
        importance: mem.importance,
        sourceType: 'chat',
        sourceId: chatSession.id,
        context: mem.context,
        sourceDate: new Date(),
      });
      console.log(`${LOG_PREFIX} Saved memory: ${mem.content.substring(0, 50)}...`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to save memory:`, error);
    }
  }
}
```

**Updated system prompt:**
```
- When ${userName} shares a preference, fact, or correction about themselves, include it in memoriesToSave:
  - Name preferences are HIGH importance (0.9)
  - General preferences are MEDIUM importance (0.7)
  - Facts about their life are MEDIUM importance (0.6)
```

## How It Works

1. **User shares information**: User says "Call me Masa" in chat
2. **LLM detects preference**: Izzie recognizes this as a name preference
3. **LLM includes in response**:
   ```json
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
   ```
4. **API saves memory**: Chat API extracts `memoriesToSave` and saves to Weaviate
5. **Future retrieval**: Memory is retrieved in future conversations via semantic search

## Memory Categories

- **preference**: User likes/dislikes, habits (slow decay, high importance)
- **fact**: Objective information (slow decay, medium-high importance)
- **event**: Something that happened/will happen (medium-fast decay)
- **decision**: A decision that was made (medium decay)
- **sentiment**: Emotional context (fast decay, lower importance)
- **reminder**: Something to remember for later (very fast decay)
- **relationship**: How entities relate to each other (slow decay)

## Importance Levels

- **0.9**: Critical - Name preferences, essential personal info
- **0.7**: High - General preferences, important facts about user
- **0.6**: Medium - Facts about their life, work info
- **0.5**: Low - Minor details

## Testing

### Manual Testing
1. Start dev server: `npm run dev`
2. Open chat and say: "Call me Masa"
3. Verify Izzie acknowledges and saves the preference
4. In next message, verify Izzie uses "Masa"
5. Check logs for: `[Chat API] Saved memory: User prefers to be called Masa...`

### Script Testing
```bash
# Test memory persistence (requires Weaviate running)
npx tsx scripts/test-memory-persistence.ts
```

## Example Conversations

### Name Preference
**User**: "Call me Masa"
**Izzie**: "Of course! I'll call you Masa from now on."
**Memory saved**:
- Category: preference
- Content: "User prefers to be called Masa"
- Importance: 0.9

### Work Information
**User**: "I work as a software engineer at Acme Corp"
**Izzie**: "Got it! I'll remember that you're a software engineer at Acme Corp."
**Memory saved**:
- Category: fact
- Content: "User works as a software engineer at Acme Corp"
- Importance: 0.7

### Meeting Preference
**User**: "I prefer morning meetings"
**Izzie**: "Noted! I'll keep that in mind when discussing scheduling."
**Memory saved**:
- Category: preference
- Content: "User prefers morning meetings"
- Importance: 0.7

## Integration with Existing Systems

- **Weaviate Storage**: Memories saved to existing Memory collection
- **Semantic Search**: Memories retrieved via context-retrieval system
- **Temporal Decay**: Memories use existing decay system
- **Session Tracking**: `sourceId` links memory to chat session

## Future Enhancements

1. **Memory Confirmation**: Show user when memory is saved (UI notification)
2. **Memory Management**: UI for viewing/editing/deleting saved memories
3. **Smart Deduplication**: Detect and merge similar memories
4. **Memory Strength Indicator**: Show user which memories are strongest
5. **Memory Export**: Allow users to export their memories

## Files Modified

- `src/lib/chat/session/types.ts` - Added MemoryToSave interface and updated response format
- `src/app/api/chat/route.ts` - Added memory saving logic and updated system prompt

## Files Created

- `scripts/test-memory-persistence.ts` - Test script for memory persistence

## LOC Delta

- Added: ~80 lines (types, logic, documentation)
- Removed: 0 lines
- Net Change: +80 lines
- Phase: Enhancement (adding new functionality to existing chat system)
