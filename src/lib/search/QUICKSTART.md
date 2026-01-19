# Web Search Infrastructure - Quick Start

## Setup

1. **Set API Key**
   ```bash
   # In .env.local
   BRAVE_SEARCH_API_KEY=your_api_key_here
   ```

2. **Get API Key**
   - Sign up at https://brave.com/search/api/
   - Free tier: 2,000 queries/month, 1 req/sec

## Basic Usage

### Search the Web
```typescript
import { webSearch } from '@/lib/search';

const results = await webSearch('your query', { maxResults: 5 });
```

### Fetch Content
```typescript
import { fetchAndCache } from '@/lib/search';

const content = await fetchAndCache(taskId, 'https://example.com');
console.log(content.title);
console.log(content.content); // Clean text
```

### Search + Fetch
```typescript
import { searchAndFetch } from '@/lib/search';

const results = await searchAndFetch(taskId, 'your query');
results.forEach(r => {
  console.log(r.title);              // From search
  console.log(r.fetchResult.content); // Fetched content
});
```

## Common Patterns

### Research Task
```typescript
import { createTask } from '@/agents/base/task-manager';
import { searchAndFetch } from '@/lib/search';

// Create task
const task = await createTask('research', userId, {
  query: 'TypeScript patterns',
  maxSources: 10
});

// Search and fetch
const results = await searchAndFetch(
  task.id,
  task.input.query,
  { maxResults: task.input.maxSources }
);

// Process results
for (const result of results) {
  // Extract findings, save to research_findings table
}
```

### Batch Fetch URLs
```typescript
import { batchFetchAndCache } from '@/lib/search';

const urls = ['url1', 'url2', 'url3'];
const results = await batchFetchAndCache(taskId, urls, {
  concurrency: 5,
  timeout: 15000
});
```

### Cache Management
```typescript
import { getCacheStats, pruneExpiredCache } from '@/lib/search';

// Get stats
const stats = await getCacheStats(taskId);
console.log(`Cached: ${stats.fetched}, Failed: ${stats.failed}`);

// Prune old entries
const pruned = await pruneExpiredCache();
console.log(`Removed ${pruned} expired entries`);
```

## Options

### SearchOptions
```typescript
{
  maxResults?: number;      // Default: 10
  freshness?: 'day' | 'week' | 'month' | 'year';
  country?: string;         // e.g., 'US'
  language?: string;        // e.g., 'en'
}
```

### FetchOptions
```typescript
{
  timeout?: number;         // Default: 30000ms
  maxSize?: number;         // Default: 5MB
  userAgent?: string;       // Default: IzzieBot
  followRedirects?: boolean; // Default: true
}
```

## Environment Variables

```bash
# Required
BRAVE_SEARCH_API_KEY=xxx

# Optional (defaults shown)
SEARCH_RATE_LIMIT_PER_SECOND=1
SEARCH_RATE_LIMIT_PER_DAY=2000
FETCH_TIMEOUT_MS=30000
FETCH_MAX_SIZE_BYTES=5242880
```

## Testing

```bash
# Run test script
npx tsx scripts/test-search.ts
```

## Troubleshooting

### "API key not configured"
- Set `BRAVE_SEARCH_API_KEY` in `.env.local`
- Restart Next.js dev server

### Rate limit exceeded
- Free tier: 1 req/sec, 2000/month
- Wait or upgrade plan

### Fetch timeout
- Increase timeout: `{ timeout: 60000 }`
- Check URL is accessible

### Empty search results
- Verify API key is valid
- Check query is not empty
- Try broader search terms

## See Also

- [Full Documentation](./README.md)
- [API Reference](/src/agents/base/types.ts)
- [Database Schema](/src/lib/db/schema.ts)
