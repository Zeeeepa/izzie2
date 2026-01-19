# Memory Retrieval Investigation: Why "Prefers to be called Masa" Isn't Retrieved

**Date:** 2026-01-18
**Issue:** User saved memory "Prefers to be called Masa instead of Robert" but chatbot doesn't use it when user says "Hello"
**Memory ID:** `2d1ccdd7-f70f-4974-b730-7df1679c44c4`
**User ID:** `google-oauth2|111548693083126671619`

## Investigation Summary

After analyzing the codebase, I've identified the **root cause** and can provide specific recommendations.

---

## How Memory Retrieval Currently Works

### 1. Chat Request Flow (route.ts:69-76)

```typescript
// Retrieve relevant context (entities + memories) from Weaviate
const context = await retrieveContext(userId, message, undefined, {
  maxEntities: 10,
  maxMemories: 10,
  minMemoryStrength: 0.3,
});
```

### 2. Query Term Extraction (context-retrieval.ts:57-124)

The system extracts search terms from the user's message:

```typescript
export function extractQueryTerms(message: string): string[] {
  // Filters out stop words
  const stopWords = new Set(['the', 'a', 'an', 'and', ...]);

  // Extracts words longer than 2 characters
  const words = message.toLowerCase()
    .split(/\s+/)
    .filter((word) => {
      const cleaned = word.replace(/[^\w]/g, '');
      return cleaned.length > 2 && !stopWords.has(cleaned);
    });

  // Looks for capitalized words (potential entities)
  const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const entities = message.match(capitalizedPattern) || [];

  return [...new Set([...words, ...entities.map((e) => e.toLowerCase())])];
}
```

**For "Hello":**
- Extracted terms: `["hello"]`
- Search query: `"hello"`

### 3. Memory Search (retrieval.ts:68-173)

The system uses **BM25 keyword search** (NOT semantic/vector search):

```typescript
export async function searchMemories(options: MemorySearchOptions) {
  const client = await getWeaviateClient();
  const collection = client.collections.get(MEMORY_COLLECTION);

  // Use BM25 keyword search
  const result = await collection.query.bm25(options.query, {
    limit: options.limit || 20,
    returnMetadata: ['score'],
  });

  // Filter by userId, category, strength, etc.
  // Then rank by decay-weighted relevance
}
```

**BM25 Keyword Search:**
- Requires **keyword/term overlap** between query and document
- Searches for literal word matches
- Does NOT understand semantic meaning

### 4. Context Formatting (context-formatter.ts:87-159)

If memories are found, they're formatted into the prompt:

```typescript
function formatMemoriesByCategory(memories: MemoryWithStrength[]): string {
  // Groups memories by category (preference, fact, event, etc.)
  // Sorts by strength (decay-weighted)
  // Formats as:
  //   ### Your Preferences
  //   - Prefers to be called Masa (recent)
}
```

---

## Root Cause: BM25 Keyword Search Limitation

**The Problem:**

```
Query:  "hello"
Memory: "Prefers to be called Masa instead of Robert"

Keyword Overlap: ZERO
BM25 Score: 0 (no match)
```

BM25 keyword search requires **shared words** between the query and memory content:
- "hello" contains: `["hello"]`
- "Prefers to be called Masa" contains: `["prefers", "called", "masa", "instead", "robert"]`
- **Intersection: EMPTY** → No match returned

**When It WOULD Work:**

```
Query:  "What should I call you?"
Terms:  ["call"]
Memory: "Prefers to be called Masa"
Overlap: ["called"] (stemmed match)
Result: ✅ Memory retrieved
```

---

## Why This Is a Critical Issue

### 1. User Preferences Should Always Be Available

Name preferences are **context-agnostic** - they should be included in EVERY conversation, not just when the user mentions "name" or "call".

### 2. Current Approach Misses High-Importance Memories

The memory has:
- **Category:** `preference`
- **Importance:** 0.9 (HIGH)
- **Decay Rate:** 0.01 (very slow - preferences persist)

But it's still filtered out by BM25 keyword search before decay/importance can be considered.

### 3. Poor User Experience

User explicitly taught the system: "I prefer to be called Masa"
System response to "Hello": Uses generic greeting instead of "Hello, Masa!"

---

## Solutions (In Order of Priority)

### **Solution 1: Always Include High-Importance Preferences** ⭐ (RECOMMENDED)

**Rationale:** User preferences (especially names) should be context-independent.

**Implementation:**

```typescript
// In context-retrieval.ts
export async function retrieveContext(
  userId: string,
  message: string,
  recentMessages?: ChatMessage[],
  options?: ContextRetrievalOptions
): Promise<ChatContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Extract query terms for entity/memory search
  const queryTerms = extractQueryTerms(message);
  const searchQuery = queryTerms.join(' ') || message;

  try {
    // Retrieve in parallel
    const [entities, queryMemories, preferenceMemories] = await Promise.all([
      searchEntities(searchQuery, userId, { ... }),

      // Search memories based on query
      searchMemories({
        query: searchQuery,
        userId,
        categories: opts.memoryCategories.length > 0 ? opts.memoryCategories : undefined,
        minStrength: opts.minMemoryStrength,
        limit: opts.maxMemories,
      }),

      // ALWAYS get high-importance preferences
      getRecentMemories(userId, {
        categories: ['preference'],
        minStrength: 0.7, // High-strength preferences
        limit: 5,
      }),
    ]);

    // Deduplicate and merge memories
    const memoryMap = new Map<string, MemoryWithStrength>();

    // Add preference memories first (higher priority)
    preferenceMemories.forEach(m => memoryMap.set(m.id, m));

    // Add query-matched memories (won't override preferences)
    queryMemories.forEach(m => {
      if (!memoryMap.has(m.id)) {
        memoryMap.set(m.id, m);
      }
    });

    const combinedMemories = Array.from(memoryMap.values())
      .sort((a, b) => b.strength - a.strength)
      .slice(0, opts.maxMemories);

    return {
      entities: entities.slice(0, opts.maxEntities),
      memories: combinedMemories,
      recentConversation: opts.includeRecentMessages ? recentMessages : undefined,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error retrieving context:`, error);
    return { entities: [], memories: [], ... };
  }
}
```

**Pros:**
- Simple, targeted fix
- No infrastructure changes
- Handles the most important use case (name preferences)
- Low risk

**Cons:**
- Still doesn't solve general semantic search problem
- Hard-coded logic for preferences

**Estimated Effort:** 30 minutes

---

### **Solution 2: Add Semantic/Vector Search for Memories**

**Rationale:** Weaviate supports vector search - we should use it for semantic matching.

**Current State:**
- Entities use vector search: `searchEntities()` → semantic matching ✅
- Memories use BM25 only: `searchMemories()` → keyword only ❌

**Implementation:**

```typescript
// In retrieval.ts
export async function searchMemories(
  options: MemorySearchOptions
): Promise<MemoryWithStrength[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(MEMORY_COLLECTION);

  try {
    // Use HYBRID search (BM25 + vector) instead of BM25 only
    const result = await collection.query.hybrid(options.query, {
      limit: options.limit || 20,
      alpha: 0.5, // 0.5 = balanced BM25 and vector search
      returnMetadata: ['score'],
    });

    // Rest of filtering logic remains the same...
  } catch (error) {
    console.error(`${LOG_PREFIX} Error searching memories:`, error);
    return [];
  }
}
```

**Hybrid Search Alpha Values:**
- `alpha: 0.0` → Pure BM25 (current behavior)
- `alpha: 0.5` → Balanced (50% keywords, 50% semantic)
- `alpha: 1.0` → Pure vector search (semantic only)

**Pros:**
- Solves semantic matching problem broadly
- Leverages existing Weaviate capabilities
- More intelligent retrieval across all queries

**Cons:**
- Requires vectors to be generated during memory storage
- May need to reindex existing memories
- Performance impact (vector search is slower)

**Estimated Effort:** 2-3 hours

---

### **Solution 3: Hybrid Approach** ⭐⭐ (BEST LONG-TERM)

Combine Solution 1 + Solution 2:

1. **Always include high-importance preferences** (immediate fix)
2. **Add hybrid search** (better retrieval overall)
3. **Deduplicate and rank** (prevent duplicates)

**Pros:**
- Best user experience
- Handles edge cases
- Future-proof

**Cons:**
- Most work upfront
- Requires careful testing

**Estimated Effort:** 3-4 hours

---

## Testing Recommendations

### Test Cases to Verify Fix

1. **Name Preference Test**
   - Save: "Prefers to be called Masa"
   - Query: "Hello" → Should include name in greeting
   - Query: "How are you?" → Should use name
   - Query: "Tell me about..." → Should use name

2. **General Preference Test**
   - Save: "Likes morning meetings at 9am"
   - Query: "Schedule a meeting" → Should suggest 9am
   - Query: "What time?" → No keyword match, but preference should appear

3. **Hybrid Search Test**
   - Save: "Working on authentication feature"
   - Query: "What's my current project?" → Semantic match
   - Query: "auth" → Keyword match
   - Query: "login system" → Semantic match (synonym)

---

## Code Locations

### Files to Modify

1. **src/lib/chat/context-retrieval.ts**
   - Function: `retrieveContext()` (line 131-181)
   - Add preference memory retrieval
   - Deduplicate memories

2. **src/lib/memory/retrieval.ts**
   - Function: `searchMemories()` (line 68-173)
   - Change from BM25 to hybrid search
   - Adjust alpha parameter

3. **src/lib/memory/storage.ts** (if vectors not already saved)
   - Verify vector embeddings are generated
   - May need to add vectorization

---

## Recommended Next Steps

### Phase 1: Immediate Fix (Solution 1)
**Effort:** 30 minutes
**Impact:** Fixes name preference issue immediately

1. Modify `retrieveContext()` to always fetch high-importance preferences
2. Deduplicate memories before returning
3. Test with "Hello" query

### Phase 2: Better Retrieval (Solution 2)
**Effort:** 2-3 hours
**Impact:** Improves all memory retrieval

1. Switch `searchMemories()` from BM25 to hybrid search
2. Verify vectors are being generated
3. Test semantic matching across categories

### Phase 3: Comprehensive Testing
**Effort:** 1 hour
**Impact:** Ensure no regressions

1. Test name preferences
2. Test general preferences
3. Test semantic vs keyword queries
4. Test memory decay behavior

---

## Conclusion

**Root Cause Confirmed:**
BM25 keyword search requires term overlap. "Hello" and "Prefers to be called Masa" have zero keyword overlap, so the memory is not retrieved.

**Recommended Fix:**
Implement Solution 3 (Hybrid Approach):
1. Always include high-importance preferences (quick win)
2. Add hybrid search for better semantic matching (long-term improvement)

**Impact:**
User will see: "Hello, Masa!" instead of generic greeting.

**Estimated Total Effort:** 4-5 hours (including testing)
