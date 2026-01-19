# Web Search Infrastructure

Phase 2 of the Research Agent Framework - Web search and content fetching capabilities.

## Overview

This module provides:
- **Web Search**: Brave Search API integration with rate limiting
- **Content Fetching**: Robust URL fetching with HTML parsing
- **Caching**: Database-backed cache for search results and fetched content
- **Rate Limiting**: Token bucket rate limiter for API compliance

## Components

### Types (`types.ts`)
Core TypeScript interfaces for search providers, options, results, and fetch operations.

### Brave Search Provider (`brave.ts`)
Implements Brave Search API with:
- Rate limiting (1 req/sec, 2000/day for free tier)
- Error handling
- Query parameter support (freshness, country, language)

### URL Fetcher (`fetcher.ts`)
Fetches and extracts content from URLs:
- Timeout and size limits
- HTML content extraction (removes scripts, navigation, ads)
- HTML entity decoding
- Support for HTML, text, JSON (PDF stubbed for future)

### Cache (`cache.ts`)
Database-backed caching using `research_sources` table:
- Search results: 24-hour TTL
- Fetched content: 7-day TTL
- Deduplication by URL
- Expiration and pruning

### Rate Limiter (`rate-limiter.ts`)
Token bucket algorithm with configurable limits:
- Per-second, per-minute, per-day limits
- Blocking `acquire()` method
- Quota tracking

## Environment Variables

```bash
# Required
BRAVE_SEARCH_API_KEY=your_api_key_here

# Optional (with defaults)
SEARCH_RATE_LIMIT_PER_SECOND=1
SEARCH_RATE_LIMIT_PER_DAY=2000
FETCH_TIMEOUT_MS=30000
FETCH_MAX_SIZE_BYTES=5242880  # 5MB
```

## Usage Examples

### Basic Web Search

```typescript
import { webSearch } from '@/lib/search';

const results = await webSearch('TypeScript best practices 2024', {
  maxResults: 5,
  freshness: 'month',
});

console.log(results);
// [
//   { url: '...', title: '...', snippet: '...', source: 'brave' },
//   ...
// ]
```

### Fetch and Cache Content

```typescript
import { fetchAndCache } from '@/lib/search';

const taskId = 'research-task-123';
const content = await fetchAndCache(taskId, 'https://example.com/article');

console.log(content.title); // Article title
console.log(content.content); // Clean text content
console.log(content.contentType); // 'html' | 'pdf' | 'text'
```

### Search and Fetch Combined

```typescript
import { searchAndFetch } from '@/lib/search';

const results = await searchAndFetch(
  'research-task-123',
  'Next.js server components',
  { maxResults: 3 },
  { timeout: 15000 }
);

for (const result of results) {
  console.log(result.title); // Search result title
  console.log(result.fetchResult?.content); // Fetched content
}
```

### Batch Fetch URLs

```typescript
import { batchFetchAndCache } from '@/lib/search';

const urls = [
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
];

const results = await batchFetchAndCache('task-123', urls, {
  concurrency: 5,
  timeout: 20000,
});

console.log(results.length); // 3
```

### Cache Management

```typescript
import { getCacheStats, pruneExpiredCache, clearTaskCache } from '@/lib/search';

// Get cache statistics
const stats = await getCacheStats('task-123');
console.log(stats);
// { total: 10, fetched: 8, pending: 1, failed: 1, expired: 0 }

// Prune expired entries
const pruned = await pruneExpiredCache();
console.log(`Pruned ${pruned} entries`);

// Clear task cache
const cleared = await clearTaskCache('task-123');
console.log(`Cleared ${cleared} entries`);
```

### Rate Limit Checking

```typescript
import { getBraveSearchProvider } from '@/lib/search';

const provider = getBraveSearchProvider();
const quota = provider.getRemainingQuota();

console.log(quota);
// { second: 1, minute: 60, day: 1995 }
```

## Integration with Research Agent

This module is designed to work with the Research Agent framework:

```typescript
import { webSearch, fetchAndCache } from '@/lib/search';
import { createTask } from '@/agents/base/task-manager';

// Create research task
const task = await createTask('research', userId, {
  query: 'TypeScript branded types',
  maxSources: 10,
});

// Search
const searchResults = await webSearch(task.input.query, {
  maxResults: task.input.maxSources,
});

// Fetch content
for (const result of searchResults) {
  const content = await fetchAndCache(task.id, result.url);

  // Content is now cached in research_sources table
  // Research agent can extract findings and save to research_findings
}
```

## Database Schema

The module uses the `research_sources` table:

```typescript
{
  id: string;              // UUID
  taskId: string;          // References agent_tasks.id
  url: string;             // Source URL
  title: string | null;    // Page title
  content: string | null;  // Extracted text content
  contentType: string | null; // 'html' | 'pdf' | 'text'
  relevanceScore: number | null;  // 0-100
  credibilityScore: number | null; // 0-100
  fetchStatus: string;     // 'pending' | 'fetched' | 'failed'
  fetchError: string | null;
  fetchedAt: Date | null;
  expiresAt: Date | null;  // Cache TTL
  createdAt: Date;
}
```

## Error Handling

All functions handle errors gracefully:
- Network errors return error in `FetchResult.error`
- Invalid URLs return empty results
- Missing API key logs warning and returns empty array
- Cache failures don't prevent operation

## Performance Considerations

- **Rate Limiting**: Brave Search free tier has strict limits (1 req/sec, 2000/day)
- **Batch Fetching**: Uses configurable concurrency (default 5) to avoid overwhelming servers
- **Timeouts**: Default 30s timeout prevents hanging requests
- **Size Limits**: Default 5MB max prevents memory issues
- **Caching**: Reduces redundant fetches and API calls

## Future Enhancements

- [ ] PDF text extraction (currently stubbed)
- [ ] Image/media handling
- [ ] Additional search providers (Google, DuckDuckGo)
- [ ] Content quality scoring
- [ ] Automatic deduplication of similar content
- [ ] Streaming fetch for large files
- [ ] Better HTML parsing (consider cheerio or linkedom)

## Testing

```bash
# Set up environment
export BRAVE_SEARCH_API_KEY=your_key

# Run tests (when available)
npm run test:unit src/lib/search
```

## Related Files

- `/src/agents/base/types.ts` - Agent framework types
- `/src/agents/base/task-manager.ts` - Task management
- `/src/lib/db/schema.ts` - Database schema including research_sources
