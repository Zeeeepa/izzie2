# Weaviate Integration

This module provides entity storage and retrieval using Weaviate Cloud, replacing the unused Neo4j setup.

## Overview

Weaviate is used to store extracted entities (people, companies, projects, locations, etc.) from emails and calendar events. It provides:

- **Fast keyword search** (BM25 algorithm)
- **Structured entity storage** with type safety
- **Scalable cloud hosting** (no local infrastructure needed)
- **Flexible querying** by source, user, or entity type

## Setup

### 1. Environment Variables

Add to `.env.local`:

```env
WEAVIATE_URL=https://2br9ofb5rtat5glmklmxyw.c0.us-east1.gcp.weaviate.cloud
WEAVIATE_API_KEY=<your-api-key>
```

### 2. Initialize Schema

Run once to create collections:

```bash
npx tsx scripts/init-weaviate-schema.ts
```

This creates 7 collections:
- `Person` - People extracted from content
- `Company` - Companies/organizations
- `Project` - Project names
- `Date` - Dates and deadlines
- `Topic` - Topics/subjects
- `Location` - Physical locations
- `ActionItem` - Action items with assignee/deadline/priority

## Usage

### Save Entities

```typescript
import { saveEntities } from '@/lib/weaviate';
import type { Entity } from '@/lib/extraction/types';

const entities: Entity[] = [
  {
    type: 'person',
    value: 'John Doe',
    normalized: 'john_doe',
    confidence: 0.95,
    source: 'body',
    context: 'Meeting with John Doe on Friday',
  },
  // ... more entities
];

await saveEntities(entities, userId, emailId);
```

### Search Entities

```typescript
import { searchEntities } from '@/lib/weaviate';

// Search all entities
const results = await searchEntities('John Doe', userId);

// Search specific entity type
const people = await searchEntities('John', userId, {
  entityType: 'person',
  limit: 10,
  minConfidence: 0.8,
});
```

### Get Entities by Source

```typescript
import { getEntitiesBySource } from '@/lib/weaviate';

// Get all entities from a specific email
const entities = await getEntitiesBySource(emailId, userId);
```

### Delete Entities

```typescript
import { deleteEntitiesBySource } from '@/lib/weaviate';

// Delete all entities from a source (e.g., when email is deleted)
const deletedCount = await deleteEntitiesBySource(emailId, userId);
```

### Get Statistics

```typescript
import { getEntityStats } from '@/lib/weaviate';

const stats = await getEntityStats(userId);
// { person: 42, company: 15, project: 8, ... }
```

## Integration with Extraction Pipeline

After extracting entities from an email or calendar event, save them to Weaviate:

```typescript
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { saveEntities } from '@/lib/weaviate';

// Extract entities from email
const extractor = getEntityExtractor();
const result = await extractor.extractFromEmail(email);

// Save to Weaviate
if (result.entities.length > 0) {
  await saveEntities(result.entities, userId, email.id);
}
```

## Schema Details

### Base Entity Properties (All Collections)

| Property | Type | Description |
|----------|------|-------------|
| `value` | text | Original entity value |
| `normalized` | text | Normalized form (lowercase, underscored) |
| `confidence` | number | Extraction confidence (0-1) |
| `source` | text | Where found: metadata, body, or subject |
| `sourceId` | text | Email or event ID |
| `userId` | text | User who owns this entity |
| `extractedAt` | text | ISO timestamp |
| `context` | text | Surrounding text |

### ActionItem Additional Properties

| Property | Type | Description |
|----------|------|-------------|
| `assignee` | text | Person assigned to task |
| `deadline` | text | Deadline (ISO date) |
| `priority` | text | low, medium, or high |

## Testing

Run the test suite:

```bash
npx tsx scripts/test-weaviate-entities.ts
```

This tests:
- Entity insertion
- Retrieval by source
- Keyword search
- Statistics aggregation
- Entity deletion

## API Reference

See inline TypeDoc comments in:
- `src/lib/weaviate/client.ts` - Connection management
- `src/lib/weaviate/schema.ts` - Schema definitions
- `src/lib/weaviate/entities.ts` - CRUD operations

## Migration from Neo4j

The Weaviate integration replaces the unused Neo4j setup with:
- Simpler setup (cloud-hosted, no local infrastructure)
- Better search capabilities (BM25 keyword search)
- Type-safe TypeScript client
- Structured collections per entity type

No migration needed as Neo4j was not in use.

## Resources

- [Weaviate TypeScript Client Docs](https://docs.weaviate.io/weaviate/client-libraries/typescript)
- [Weaviate Search Filters](https://docs.weaviate.io/weaviate/search/filters)
- [BM25 Keyword Search](https://weaviate.io/blog/hybrid-search-for-web-developers)
