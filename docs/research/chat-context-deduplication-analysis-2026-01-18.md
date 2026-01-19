# Chat Context Deduplication and Formatting Issues

**Date**: 2026-01-18
**Researcher**: Claude (Research Agent)
**Focus**: Entity deduplication and nickname usage in chat context

## Executive Summary

Two critical issues identified in the chat context system:

1. **Entity Deduplication Issue**: Entities are duplicated across multiple collections, with "Robert (Masa) Matsuoka" appearing 5 times in chat context
2. **Nickname Formatting Issue**: The entity context shows "(Masa)" but doesn't explicitly instruct the LLM to use the nickname

---

## Issue 1: Entity Deduplication Problem

### Root Cause

**Location**: `/src/lib/weaviate/entities.ts` (lines 94-162)

The `searchEntities()` function searches across **multiple Weaviate collections** (one per entity type) and aggregates all results without deduplication:

```typescript
// Line 109-111: Determines which collections to search
const collectionsToSearch = options?.entityType
  ? [COLLECTIONS[options.entityType]]
  : Object.values(COLLECTIONS);

const allResults: Entity[] = [];

for (const collectionName of collectionsToSearch) {
  // ... searches collection and filters ...
  allResults.push(...filtered); // Line 154: NO DEDUPLICATION!
}
```

**Collections being searched** (from `/src/lib/weaviate/schema.ts`):
- `Person` collection
- `Company` collection
- `Project` collection
- `Date` collection
- `Topic` collection
- `Location` collection
- `ActionItem` collection

### Why "Robert (Masa) Matsuoka" Appears 5 Times

The same person entity is stored in **different source documents** (emails/calendar events). When searching:

1. BM25 search returns matches from each collection with `limit: 20` per collection
2. Each match for "Robert (Masa) Matsuoka" from different sources is returned separately
3. All results are aggregated without checking for duplicates
4. The entity appears 5 times because it was extracted from 5 different emails/events

**Example scenario**:
```
Email 1 → Extracts "Robert (Masa) Matsuoka" → Stored in Person collection with sourceId: email-123
Email 2 → Extracts "Robert (Masa) Matsuoka" → Stored in Person collection with sourceId: email-456
Email 3 → Extracts "Robert (Masa) Matsuoka" → Stored in Person collection with sourceId: email-789
...
BM25 search → Returns all 5 instances → All added to context
```

### Deduplication Logic Analysis

**Status**: ❌ **NO DEDUPLICATION EXISTS**

Checked locations:
- ✅ `/src/lib/chat/context-retrieval.ts` - Deduplicates **memories** (lines 179-194) but **NOT entities**
- ❌ `/src/lib/weaviate/entities.ts` - No deduplication in `searchEntities()`
- ❌ `/src/lib/chat/context-formatter.ts` - Formats entities as-is, no deduplication

**Memory deduplication example** (what SHOULD be done for entities):
```typescript
// Lines 179-194 in context-retrieval.ts
const memoryMap = new Map<string, MemoryWithStrength>();

preferenceMemories.forEach((mem) => {
  memoryMap.set(mem.id, mem); // Uses memory ID as key
});

memories.forEach((mem) => {
  if (!memoryMap.has(mem.id)) {
    memoryMap.set(mem.id, mem);
  }
});

const mergedMemories = Array.from(memoryMap.values());
```

**Problem**: Entities don't have a unique `id` field in the return data structure, only values like `value`, `normalized`, `confidence`, etc.

---

## Issue 2: Nickname Formatting Problem

### Root Cause

**Location**: `/src/lib/chat/context-formatter.ts` (lines 54-76)

The entity formatter displays entities with context in parentheses but doesn't provide specific instructions:

```typescript
// Lines 54-59
const items = sortedEntities.map((entity) => {
  const parts = [entity.value];

  // Add context if available
  if (entity.context) {
    parts.push(`(${entity.context})`); // Shows as "Robert (Masa) Matsuoka (context...)"
  }

  return `  - ${parts.join(' ')}`;
});
```

**Example output**:
```markdown
### People
  - Robert (Masa) Matsuoka (Mentioned in email thread about project meeting)
```

### LLM System Prompt Analysis

**Location**: `/src/app/api/chat/route.ts` (lines 87-107)

Current system prompt:
```typescript
const systemPrompt = `You are Izzie, ${userName}'s personal AI assistant...

**Instructions:**
- Address ${userName} by name when appropriate
- Use the context provided to give personalized, relevant responses
- Reference specific people, companies, projects, and memories when helpful
- Be conversational, warm, and natural
...
```

**Problem**: No specific instruction to use nicknames for entities when available

### Context Assembly Flow

The context is assembled in this order (from `/src/lib/chat/session/manager.ts`):

1. **System prompt** (line 64-67) - Base instructions
2. **Entity context** (lines 70-75) - Formatted entities including "Robert (Masa) Matsuoka"
3. **Current task** (lines 78-83) - If exists
4. **Compressed history** (lines 86-91) - If exists
5. **Recent messages** (lines 94-99) - Last 5 pairs
6. **Current user message** (lines 102-105)

**Entity context format** (from `formatContextForPrompt()`):
```markdown
## Relevant Context

### People
  - Robert (Masa) Matsuoka (context details...)

### Companies
  - Anthropic (AI research company)
```

The LLM sees the nickname in parentheses but doesn't have explicit instructions like:
- "When a person has a nickname in parentheses like 'Name (Nickname)', prefer using the nickname"
- "Use nicknames when available for a more personal tone"

---

## Recommendations

### Fix 1: Add Entity Deduplication

**File**: `/src/lib/weaviate/entities.ts`
**Function**: `searchEntities()`
**Lines**: After line 158

Add deduplication logic based on `normalized` field (entities with same normalized value are duplicates):

```typescript
// After line 154: allResults.push(...filtered);

// BEFORE returning, deduplicate by normalized value
const entityMap = new Map<string, Entity>();

for (const entity of allResults) {
  const key = `${entity.type}:${entity.normalized}`;

  // Keep the one with higher confidence
  const existing = entityMap.get(key);
  if (!existing || entity.confidence > existing.confidence) {
    entityMap.set(key, entity);
  }
}

const deduplicated = Array.from(entityMap.values());

console.log(`${LOG_PREFIX} Deduplicated ${allResults.length} → ${deduplicated.length} entities`);
return deduplicated;
```

**Alternative approach**: Deduplicate in `context-retrieval.ts` after calling `searchEntities()`:

```typescript
// In retrieveContext() after line 151
const entities = await searchEntities(...);

// Deduplicate entities by normalized value
const entityMap = new Map<string, Entity>();
entities.forEach((entity) => {
  const key = `${entity.type}:${entity.normalized}`;
  if (!entityMap.has(key) || entity.confidence > entityMap.get(key)!.confidence) {
    entityMap.set(key, entity);
  }
});
const deduplicatedEntities = Array.from(entityMap.values());
```

### Fix 2: Add Nickname Usage Instructions

**File**: `/src/app/api/chat/route.ts`
**Location**: System prompt (lines 87-107)

Add explicit nickname instruction:

```typescript
const systemPrompt = `You are Izzie, ${userName}'s personal AI assistant...

**Instructions:**
- Address ${userName} by name when appropriate (not every message, but naturally)
- When entities show nicknames in parentheses like "Name (Nickname)", prefer using the nickname for a more personal tone
- Use the context provided to give personalized, relevant responses
...
```

**Alternative**: Add instruction in entity context section (in `context-formatter.ts`):

```typescript
// Lines 168-176 in formatContextForPrompt()
sections.push('## Relevant Context');
sections.push('');
sections.push('Note: When people have nicknames shown in parentheses like "Name (Nickname)", prefer using the nickname.');
sections.push('');
```

### Fix 3: Improve Entity Display Format

**File**: `/src/lib/chat/context-formatter.ts`
**Function**: `formatEntitiesByType()`
**Lines**: 54-76

Make nickname usage more explicit:

```typescript
const items = sortedEntities.map((entity) => {
  let displayValue = entity.value;

  // Extract nickname from value if it contains parentheses
  const nicknameMatch = entity.value.match(/\(([^)]+)\)/);
  if (nicknameMatch && entity.type === 'person') {
    displayValue = `${entity.value} — prefer "${nicknameMatch[1]}"`;
  }

  const parts = [displayValue];

  // Add context if available
  if (entity.context) {
    parts.push(`[${entity.context}]`);
  }

  return `  - ${parts.join(' ')}`;
});
```

**Example output**:
```markdown
### People
  - Robert (Masa) Matsuoka — prefer "Masa" [Mentioned in email about project]
```

---

## Impact Assessment

### Issue 1: Deduplication
- **Severity**: High
- **Impact**:
  - Wastes context window space with duplicate entities
  - Confuses LLM with repetitive information
  - Increases token costs
  - May appear as if same person is mentioned 5x more important than they are

### Issue 2: Nickname Formatting
- **Severity**: Medium
- **Impact**:
  - LLM doesn't consistently use preferred nicknames
  - Less personalized user experience
  - User may need to correct AI repeatedly

---

## Testing Plan

### Test 1: Verify Deduplication

```typescript
// Test script
const entities = await searchEntities('Masa', userId, { limit: 20 });
console.log('Total entities:', entities.length);
console.log('Unique normalized values:', new Set(entities.map(e => e.normalized)).size);

// Expected: Unique count should equal total count after fix
```

### Test 2: Verify Nickname Usage

```
User: "Who is Masa?"
Expected AI response: Should use "Masa" consistently, not "Robert"

User: "Tell me about Robert (Masa) Matsuoka"
Expected AI response: Should switch to "Masa" in follow-up references
```

---

## Code Locations Summary

| Issue | File | Function | Lines | Fix Type |
|-------|------|----------|-------|----------|
| Deduplication | `/src/lib/weaviate/entities.ts` | `searchEntities()` | 154-161 | Add Map-based dedup |
| Deduplication (alt) | `/src/lib/chat/context-retrieval.ts` | `retrieveContext()` | After 151 | Add Map-based dedup |
| Nickname instruction | `/src/app/api/chat/route.ts` | System prompt | 87-107 | Add instruction |
| Nickname format | `/src/lib/chat/context-formatter.ts` | `formatEntitiesByType()` | 54-76 | Enhance display |

---

## Next Steps

1. **Immediate**: Implement entity deduplication in `searchEntities()` or `retrieveContext()`
2. **Quick win**: Add nickname usage instruction to system prompt
3. **Polish**: Enhance entity display format to make nicknames more explicit
4. **Testing**: Run test queries to verify both fixes work as expected
5. **Monitor**: Check chat logs to ensure deduplication is working and nicknames are being used

---

## Additional Observations

### Positive Findings

✅ **Memory deduplication works correctly** (lines 179-194 in `context-retrieval.ts`)
- Uses Map with memory ID as key
- Prioritizes preference memories over query-matched memories
- Good pattern to replicate for entities

✅ **Entity confidence filtering exists** (line 150-152 in `entities.ts`)
- Allows filtering out low-confidence entities
- Default `minConfidence: 0.6` in context retrieval

✅ **Entity context is well-structured**
- Grouped by type (People, Companies, Projects, etc.)
- Sorted by confidence
- Includes source context when available

### Architecture Notes

**Weaviate Collections**:
- Each entity type has its own collection (Person, Company, etc.)
- Collections use BM25 keyword search (no vectorizer needed)
- Each entity stores: `value`, `normalized`, `confidence`, `source`, `sourceId`, `userId`, `context`
- Person entities extracted from emails/calendar are stored with their sourceId

**Context Flow**:
```
User message
  ↓
extractQueryTerms() - Extract keywords
  ↓
searchEntities() - BM25 search across all collections
  ↓
[NO DEDUPLICATION] ← PROBLEM 1
  ↓
formatEntitiesByType() - Group by type and format
  ↓
[NO NICKNAME INSTRUCTION] ← PROBLEM 2
  ↓
buildContext() - Assemble full message array
  ↓
LLM receives context with duplicates and no nickname guidance
```

---

## References

- `/src/lib/weaviate/entities.ts` - Entity storage and search
- `/src/lib/chat/context-retrieval.ts` - Context retrieval and memory deduplication
- `/src/lib/chat/context-formatter.ts` - Entity formatting for LLM prompt
- `/src/app/api/chat/route.ts` - Chat API endpoint and system prompt
- `/src/lib/chat/session/manager.ts` - Message context assembly
