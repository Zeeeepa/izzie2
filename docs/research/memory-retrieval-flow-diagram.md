# Memory Retrieval Flow Diagram

## Current Flow (Broken for Name Preferences)

```
┌─────────────────────────────────────────────────────────────────────┐
│ User Input: "Hello"                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ extractQueryTerms()                                                 │
│                                                                     │
│ Input:  "Hello"                                                     │
│ Output: ["hello"]                                                   │
│                                                                     │
│ Stop words filtered, capitalized words extracted                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ searchMemories() - BM25 Keyword Search                              │
│                                                                     │
│ Query: "hello"                                                      │
│                                                                     │
│ Weaviate BM25 Search:                                               │
│   collection.query.bm25("hello", { limit: 10 })                    │
│                                                                     │
│ Stored Memories:                                                    │
│   1. "Prefers to be called Masa instead of Robert"                 │
│      Keywords: [prefers, called, masa, instead, robert]            │
│      Overlap with "hello": NONE ❌                                  │
│      Score: 0                                                       │
│                                                                     │
│   2. "Likes morning meetings at 9am"                                │
│      Keywords: [likes, morning, meetings, 9am]                     │
│      Overlap with "hello": NONE ❌                                  │
│      Score: 0                                                       │
│                                                                     │
│ Result: 0 memories returned                                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ formatContextForPrompt()                                            │
│                                                                     │
│ Input: { entities: [...], memories: [] }                           │
│                                                                     │
│ Output: "No relevant personal context found for this query."       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ System Prompt (route.ts:87-107)                                    │
│                                                                     │
│ "You are Izzie, [userName]'s personal AI assistant."               │
│                                                                     │
│ ## Relevant Context                                                │
│ No relevant personal context found for this query.                 │
│                                                                     │
│ Instructions:                                                       │
│ - Address [userName] by name when appropriate                      │
│                                                                     │
│ ❌ Problem: No context provided, so LLM uses generic userName      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LLM Response                                                        │
│                                                                     │
│ "Hello! How can I help you today?"                                 │
│                                                                     │
│ ❌ Generic greeting instead of "Hello, Masa!"                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Fixed Flow (Solution 1: Always Include Preferences)

```
┌─────────────────────────────────────────────────────────────────────┐
│ User Input: "Hello"                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ extractQueryTerms()                                                 │
│                                                                     │
│ Input:  "Hello"                                                     │
│ Output: ["hello"]                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ retrieveContext() - PARALLEL RETRIEVAL                              │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ searchMemories({ query: "hello" })                          │   │
│ │ Result: [] (no keyword match)                               │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ getRecentMemories({                                         │   │
│ │   categories: ['preference'],                               │   │
│ │   minStrength: 0.7                                          │   │
│ │ })                                                          │   │
│ │                                                             │   │
│ │ ✅ ALWAYS fetches high-importance preferences               │   │
│ │                                                             │   │
│ │ Result: [                                                   │   │
│ │   {                                                         │   │
│ │     content: "Prefers to be called Masa instead of Robert",│   │
│ │     category: "preference",                                │   │
│ │     strength: 0.95,                                        │   │
│ │     importance: 0.9                                        │   │
│ │   }                                                         │   │
│ │ ]                                                           │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ Deduplicate and Merge:                                              │
│   Combined: [preference memory]                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ formatContextForPrompt()                                            │
│                                                                     │
│ Input: {                                                            │
│   entities: [],                                                     │
│   memories: [                                                       │
│     {                                                               │
│       content: "Prefers to be called Masa instead of Robert",      │
│       category: "preference",                                      │
│       strength: 0.95                                               │
│     }                                                               │
│   ]                                                                 │
│ }                                                                   │
│                                                                     │
│ Output:                                                             │
│   ## Relevant Context                                              │
│                                                                     │
│   ### Your Preferences                                             │
│   - Prefers to be called Masa instead of Robert (recent)           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ System Prompt (route.ts:87-107)                                    │
│                                                                     │
│ "You are Izzie, Masa's personal AI assistant."                     │
│                                                                     │
│ ## Relevant Context                                                │
│                                                                     │
│ ### Your Preferences                                               │
│ - Prefers to be called Masa instead of Robert (recent)             │
│                                                                     │
│ Instructions:                                                       │
│ - Address Masa by name when appropriate                            │
│                                                                     │
│ ✅ LLM now knows to use "Masa" instead of generic userName         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LLM Response                                                        │
│                                                                     │
│ "Hello, Masa! How can I help you today?"                           │
│                                                                     │
│ ✅ Personalized greeting using preferred name                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Comparison: BM25 vs Hybrid vs Always-Include

### Scenario: User says "Hello"

| Approach | Query | Memories Retrieved | Why |
|----------|-------|-------------------|-----|
| **BM25 Only** (Current) | "hello" | ❌ None | No keyword overlap with "Prefers to be called Masa" |
| **Hybrid Search** (Solution 2) | "hello" | ✅ Name preference | Vector search finds semantic similarity between greetings and identity |
| **Always-Include Preferences** (Solution 1) | N/A | ✅ Name preference | Fetches preferences independent of query |

### Scenario: User says "What should I call you?"

| Approach | Query | Memories Retrieved | Why |
|----------|-------|-------------------|-----|
| **BM25 Only** (Current) | "call" | ✅ Name preference | Keyword "call" matches "called" in memory |
| **Hybrid Search** (Solution 2) | "call" | ✅ Name preference | Both keyword AND semantic match |
| **Always-Include Preferences** (Solution 1) | N/A | ✅ Name preference | Always fetched regardless |

### Scenario: User says "Schedule a meeting"

| Approach | Query | Memories Retrieved | Why |
|----------|-------|-------------------|-----|
| **BM25 Only** (Current) | "schedule meeting" | ❌ Meeting time preference | Keywords "schedule" and "meeting" don't appear in "Likes morning meetings at 9am" |
| **Hybrid Search** (Solution 2) | "schedule meeting" | ✅ Meeting time preference | Vector search connects "schedule meeting" with "morning meetings" |
| **Always-Include Preferences** (Solution 1) | N/A | ✅ Meeting time preference | All preferences included |

---

## Why BM25 Fails for User Preferences

### BM25 Algorithm (Simplified)

```
Score(query, document) = Σ (IDF(term) × TF(term, document))
                         for each term in query ∩ document

Where:
- IDF = Inverse Document Frequency (how rare is this term?)
- TF = Term Frequency (how often does term appear in document?)
- ∩ = Intersection (shared terms)
```

### Example Failure

```
Query:    "hello"
Document: "Prefers to be called Masa instead of Robert"

Shared Terms: {} (empty set)
Score: 0 (no calculation possible)
Result: Document not returned
```

### Why This Is Wrong for Preferences

**User preferences are context-agnostic:**
- Name preferences apply to ALL conversations
- Don't depend on specific keywords being mentioned
- Should be "always-on" context

**BM25 assumes context-dependent relevance:**
- Document is relevant IF it shares keywords with query
- Good for: "Find emails about the Q4 budget meeting"
- Bad for: "What's my name preference?" (user never says this)

---

## Solution Comparison Matrix

| Criterion | Solution 1: Always-Include | Solution 2: Hybrid Search | Solution 3: Both |
|-----------|---------------------------|---------------------------|------------------|
| **Fixes name preference issue** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Fixes general preference retrieval** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Improves semantic matching** | ❌ No | ✅ Yes | ✅ Yes |
| **Implementation complexity** | ⭐ Simple | ⭐⭐ Medium | ⭐⭐⭐ Complex |
| **Risk of regression** | ⭐ Low | ⭐⭐ Medium | ⭐⭐ Medium |
| **Long-term maintainability** | ⭐⭐ Medium | ⭐⭐⭐ High | ⭐⭐⭐ High |
| **Performance impact** | None | Small | Small |
| **Estimated effort** | 30 min | 2-3 hours | 3-4 hours |

---

## Recommended Implementation Order

### Phase 1: Quick Win (30 minutes)
Implement Solution 1 to fix the immediate issue.

### Phase 2: Better Retrieval (2 hours)
Add hybrid search for improved semantic matching.

### Phase 3: Optimization (1 hour)
Fine-tune alpha parameter and test edge cases.

---

## Testing Checklist

After implementing the fix:

- [ ] User says "Hello" → Response includes "Masa"
- [ ] User says "Hey there" → Response includes "Masa"
- [ ] User says "Good morning" → Response includes "Masa"
- [ ] User saves new preference → Immediately available in next message
- [ ] High-importance preferences always included (even with unrelated queries)
- [ ] Low-importance preferences only included when query-relevant
- [ ] No duplicate memories in context
- [ ] Memory decay still works correctly
