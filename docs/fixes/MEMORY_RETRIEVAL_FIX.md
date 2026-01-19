# Memory Retrieval Fix: Always Include High-Importance Preferences

## Problem

The BM25 keyword search in memory retrieval requires word overlap between the query and stored memories. This caused high-importance preference memories (like "Prefers to be called Masa") to not be retrieved when the user query had no overlapping keywords (e.g., "Hello").

**Example failure case:**
- User says: "Hello"
- Memory: "Prefers to be called Masa" (importance: 0.9, category: preference)
- Result: Memory not retrieved because no keyword overlap

## Solution

Modified the memory retrieval system to **always fetch high-importance preference memories in parallel** with query-matched memories, then merge and deduplicate the results.

### Changes Made

#### 1. Added `minImportance` Filter Support

**File: `/src/lib/memory/types.ts`**
- Added `minImportance?: number` to `MemorySearchOptions` interface
- Allows filtering memories by their importance value (0-1)

**File: `/src/lib/memory/retrieval.ts`**
- Implemented `minImportance` filtering in `searchMemories()` function
- Filters memories before applying strength/confidence thresholds

```typescript
// Filter by minimum importance
if (options.minImportance !== undefined) {
  memoriesWithStrength = memoriesWithStrength.filter(
    (m) => m.importance >= options.minImportance!
  );
}
```

#### 2. Modified Context Retrieval to Always Fetch Preferences

**File: `/src/lib/chat/context-retrieval.ts`**

Modified `retrieveContext()` function to:

1. **Fetch three sources in parallel:**
   - Entities (existing behavior)
   - Query-matched memories (existing behavior)
   - **High-importance preferences** (NEW - always fetched)

2. **Merge and deduplicate results:**
   - Preference memories added first (higher priority)
   - Query-matched memories added second
   - Duplicates removed using Set-based deduplication

```typescript
const [entities, memories, preferenceMemories] = await Promise.all([
  searchEntities(...),
  searchMemories({ query: searchQuery, ... }),
  searchMemories({
    query: 'user preferences name',
    userId,
    categories: ['preference'],
    minImportance: 0.8,
    limit: 5,
  }),
]);

// Merge and deduplicate
const allMemoryIds = new Set<string>();
const mergedMemories = [];

// Preferences first
for (const mem of preferenceMemories) {
  if (!allMemoryIds.has(mem.id)) {
    allMemoryIds.add(mem.id);
    mergedMemories.push(mem);
  }
}

// Query-matched second
for (const mem of memories) {
  if (!allMemoryIds.has(mem.id)) {
    allMemoryIds.add(mem.id);
    mergedMemories.push(mem);
  }
}
```

### Configuration

**High-importance threshold:** 0.8 (importance >= 0.8)
- Matches the default importance for preference category (see `DEFAULT_IMPORTANCE` in `types.ts`)
- Only fetches the most important preferences

**Preference query:** "user preferences name"
- Generic query to match common preference memories
- Can be expanded to include other common preference keywords

**Limit:** 5 preferences max
- Keeps token usage reasonable
- Sufficient for most user preference scenarios

## Benefits

1. **Reliable preference retrieval:** High-importance preferences like name preferences are always included
2. **No performance penalty:** Parallel fetching doesn't add latency
3. **Deduplication:** No duplicate memories in final results
4. **Priority-based merging:** Preferences appear first in context
5. **Backward compatible:** Doesn't break existing functionality

## Testing

Run the test script to verify the fix:

```bash
npx tsx scripts/test-memory-retrieval-fix.ts
```

**Expected behavior:**
- High-importance preferences (importance >= 0.8) should always be retrieved
- Deduplication should prevent duplicate memories
- Preference memories should appear in context even with generic queries like "Hello"

## Future Improvements

1. **Configurable importance threshold:** Allow customization via options
2. **Category-specific always-fetch:** Extend to other critical categories (not just preferences)
3. **Smart query expansion:** Use embeddings to find related preference terms
4. **User-specific preference keywords:** Learn which preference keywords are most relevant per user

## Related Files

- `/src/lib/memory/types.ts` - Type definitions
- `/src/lib/memory/retrieval.ts` - Memory search implementation
- `/src/lib/chat/context-retrieval.ts` - Context retrieval for chat
- `/scripts/test-memory-retrieval-fix.ts` - Test script

## Migration Notes

No migration required - this is a backward-compatible enhancement. Existing code will continue to work without changes.
