# Drive Search Failure Analysis

**Date**: February 12, 2026
**Issue**: Drive searches returning no results, causing research to fail with "Failed to fetch any content from any source"
**Status**: Root cause identified

## Root Cause

The Drive source (`src/agents/research/sources/drive-source.ts`) **does NOT extract keywords** from the search query like the email source does. It passes the entire raw query directly to Drive's `fullText` and `name` search.

### The Problem

**Email source** (working):
```typescript
// Extract keywords from query for Gmail API server-side search
const keywords = extractKeywords(query);  // ✅ Filters stop words

// Use Gmail API query syntax for server-side filtering
const batch = await gmailService.fetchEmails({
  folder,
  maxResults,
  since,
  keywords, // Pass keywords to Gmail API for server-side search
});
```

**Drive source** (broken):
```typescript
// Build search query
const searchQuery = `fullText contains '${query}' or name contains '${query}'`;  // ❌ Uses raw query
```

### Why This Breaks

When users search for:
- **"Hot Flash set list setlist songs"**
- **"Hot Flash band songs music"**
- **"Go Gos setlist songs"**

The Drive API query becomes:
```
fullText contains 'Hot Flash set list setlist songs' or name contains 'Hot Flash set list setlist songs'
```

This searches for documents containing the **EXACT PHRASE** "Hot Flash set list setlist songs" in fullText OR in the filename.

**Problems with this approach:**
1. **Too restrictive** - Unlikely any document contains the entire phrase
2. **No keyword extraction** - Stop words like "list", "songs", "music" dilute the search
3. **No OR logic between keywords** - Searching for AND of all words, not OR of keywords

### Expected Behavior (Email Source Pattern)

Email source extracts keywords:
```typescript
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'from', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'can', 'could', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(Boolean);
}
```

This would extract:
- **"Hot Flash set list setlist songs"** → `["hot", "flash", "set", "list", "setlist", "songs"]`
- **"Hot Flash band songs music"** → `["hot", "flash", "band", "songs", "music"]`

Then Gmail API searches with OR logic: `hot OR flash OR band OR songs OR music`

## Why Web Search Works

Web search doesn't have this issue because:
1. It uses `webSearch()` from `@/lib/search`, which likely handles query parsing internally
2. Web search APIs (Google Search, DuckDuckGo) are designed to handle natural language queries
3. They automatically do keyword extraction, ranking, and relevance scoring

## Investigation: Research Agent Error Handling

Checking `src/agents/research/research-agent.ts` line 182-184:

```typescript
if (contentForAnalysis.length === 0) {
  throw new Error('Failed to fetch any content from any source');
}
```

This error is thrown when:
- **ALL sources** return zero results
- In the user's case: Drive returned 0, email returned 0, calendar returned 0

The error is triggered **AFTER** all sources have attempted search, not during individual source failures.

### Source Failure Handling

Lines 372-402 show individual source errors are caught and logged:
```typescript
// Search emails
if (sources.includes('email') && auth) {
  searchPromises.push(
    searchEmails(auth, query, { maxResults: maxResultsPerSource })
      .catch((error) => {
        console.error('[ResearchAgent] Email search failed:', error);
        return [];  // ✅ Returns empty array, doesn't throw
      })
  );
}

// Search Drive
if (sources.includes('drive') && auth) {
  searchPromises.push(
    searchDriveFiles(auth, query, { maxResults: maxResultsPerSource })
      .catch((error) => {
        console.error('[ResearchAgent] Drive search failed:', error);
        return [];  // ✅ Returns empty array, doesn't throw
      })
  );
}
```

So the error **"Failed to fetch any content from any source"** means:
- Drive search succeeded (no exception) but returned 0 results
- Email search succeeded but returned 0 results
- Calendar search succeeded but returned 0 results
- Web search (if enabled) succeeded but returned 0 results

## Recommended Fix

### Option 1: Extract Keywords Like Email Source (Best)

Add keyword extraction to `drive-source.ts`:

```typescript
/**
 * Extract meaningful keywords from search query
 * Filters out stop words and short words to improve Drive API search
 */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'from', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'can', 'could', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(Boolean);
}

/**
 * Search for files by name or content
 */
async searchFiles(options: DriveSearchOptions): Promise<DriveFileBatch> {
  const { query, maxResults = MAX_RESULTS_DEFAULT, orderBy, includeSharedDrives = false } = options;

  // Extract keywords for better search
  const keywords = extractKeywords(query);

  // Build search query with OR logic between keywords
  const keywordQueries = keywords.map(kw => `(fullText contains '${kw}' or name contains '${kw}')`);
  const searchQuery = keywordQueries.join(' or ');

  console.log(`[DriveService] Searching with keywords: ${keywords.join(', ')}`);

  return this.listFiles({
    query: searchQuery,
    maxResults,
    orderBy,
    includeItemsFromAllDrives: includeSharedDrives,
    supportsAllDrives: includeSharedDrives,
  });
}
```

**Result**:
- **"Hot Flash set list setlist songs"** → `hot OR flash OR set OR list OR setlist OR songs`
- **"Hot Flash band songs music"** → `hot OR flash OR band OR songs OR music`

This dramatically increases chances of finding relevant documents.

### Option 2: Use Drive's Native Search Syntax

Drive API supports more advanced search:
```typescript
const searchQuery = keywords
  .map(kw => `fullText contains '${kw}'`)
  .join(' or ') + ' or ' + keywords
  .map(kw => `name contains '${kw}'`)
  .join(' or ');
```

### Option 3: Fallback to Broader Search

If keyword search returns 0 results, fall back to broader query:
```typescript
async searchFiles(options: DriveSearchOptions): Promise<DriveFileBatch> {
  // Try keyword search first
  const keywords = extractKeywords(options.query);
  let results = await this.searchWithKeywords(keywords, options);

  // Fallback to partial match if no results
  if (results.files.length === 0 && keywords.length > 2) {
    console.log('[DriveService] No results with all keywords, trying subset');
    results = await this.searchWithKeywords(keywords.slice(0, 2), options);
  }

  return results;
}
```

## Testing Plan

1. **Unit tests for keyword extraction**:
   ```typescript
   expect(extractKeywords("Hot Flash set list setlist songs"))
     .toEqual(["hot", "flash", "set", "list", "setlist", "songs"]);

   expect(extractKeywords("the quick brown fox"))
     .toEqual(["quick", "brown", "fox"]);  // "the" filtered out
   ```

2. **Integration tests with Drive API**:
   - Test search with known document names
   - Verify keyword extraction improves recall
   - Test fallback for zero results

3. **Manual testing with user's queries**:
   - "Hot Flash set list setlist songs"
   - "Hot Flash band songs music"
   - "Go Gos setlist songs"

## Related Issues

### Calendar Source ✅ WORKING CORRECTLY

Calendar source (`src/agents/research/sources/calendar-source.ts`) **DOES** use keyword extraction correctly:

```typescript
// Extract keywords from query for client-side filtering
const keywords = extractKeywords(query);

// Fetch events in time range
const { events } = await calendarService.fetchEvents({
  timeMin: timeRange.start,
  timeMax: timeRange.end,
  maxResults: maxResults * 3, // Fetch more to allow filtering
});

// Filter events by keywords (search summary, description, location, attendees)
const filteredEvents = events.filter((event) =>
  matchesKeywords(event, keywords)
);
```

**Key differences from Drive source:**
1. ✅ Extracts keywords: `extractKeywords(query)`
2. ✅ Uses client-side filtering with OR logic: `keywords.some(keyword => searchableText.includes(keyword))`
3. ✅ Searches multiple fields: summary, description, location, attendees
4. ✅ Fetches more results than needed (`maxResults * 3`) to allow filtering

**Why calendar search might still return 0 results:**
- Calendar API doesn't support server-side fullText search like Gmail/Drive
- It only fetches events within time range (past 3 months + future 6 months)
- Then filters client-side by keywords
- If events don't exist in that time range, returns 0 results (expected behavior)

### Web Source

Web search likely works fine because search engines handle natural language queries natively.

## Authentication Status

The research agent correctly:
1. Gets OAuth2 tokens for the user
2. Configures auth for email, drive, and calendar sources
3. Handles token refresh automatically
4. Falls back gracefully if no tokens are available

So the issue is **NOT** authentication-related. It's purely about search query construction.

## Next Steps

1. **Immediate**: Implement keyword extraction in `drive-source.ts` using same pattern as `email-source.ts`
2. **Verify**: Check `calendar-source.ts` for similar issues
3. **Test**: Run manual tests with user's queries
4. **Monitor**: Check logs after deployment to verify improvements
5. **Document**: Update Drive source documentation to mention keyword extraction

## Summary Table

| Source | Keyword Extraction | Search Type | Status |
|--------|-------------------|-------------|--------|
| **Email** | ✅ YES | Gmail API server-side with keywords | ✅ Working |
| **Drive** | ❌ NO | Drive API with exact phrase match | ❌ Broken |
| **Calendar** | ✅ YES | Client-side filtering with keywords | ✅ Working |
| **Web** | ✅ N/A | Search engine handles naturally | ✅ Working |

## Conclusion

**Root Cause**: Drive source uses raw query as exact phrase match, unlike email/calendar sources which extract keywords.

**Why It Fails**:
- Query: `"Hot Flash set list setlist songs"`
- Drive API query: `fullText contains 'Hot Flash set list setlist songs'` (exact phrase)
- No documents contain this exact phrase → 0 results

**Expected Behavior**:
- Extract keywords: `["hot", "flash", "set", "list", "setlist", "songs"]`
- Build OR query: `(fullText contains 'hot' or name contains 'hot') or (fullText contains 'flash' or name contains 'flash') ...`
- Much higher chance of finding relevant documents

**Impact**: Zero results for multi-word queries that should match documents.

**Fix**: Extract keywords and build OR query like email source does.

**Estimated Effort**: 30 minutes to implement + test.

## Error Flow Visualization

```
User: "Research Hot Flash set list"
  ↓
Research Agent: searches [email, drive, calendar, web]
  ↓
Email Source: extractKeywords("Hot Flash set list") → ["hot", "flash", "set", "list"]
  → Gmail API: (hot OR flash OR set OR list) → ✅ May find emails
  ↓
Drive Source: searchQuery = "fullText contains 'Hot Flash set list'"
  → Drive API: exact phrase match → ❌ 0 results (no docs with exact phrase)
  ↓
Calendar Source: extractKeywords("Hot Flash set list") → ["hot", "flash", "set", "list"]
  → Fetch events in time range → filter client-side → ✅ May find events
  ↓
Web Source: webSearch("Hot Flash set list")
  → Search engine handles naturally → ✅ May find web pages
  ↓
Research Agent: contentForAnalysis.length === 0 (ALL sources returned 0)
  ↓
throw new Error("Failed to fetch any content from any source")
```

**Key Insight**: If even ONE source returned results, research would succeed. But Drive's exact-phrase matching prevents finding relevant documents.
