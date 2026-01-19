# Batch Email Extraction Test Endpoint

## Overview

The `/api/test/batch-extract` endpoint processes emails through the full pipeline without Inngest:

1. **Fetch emails** from Gmail (using service account auth)
2. **Extract entities** using entity-extractor service
3. **Store results** in `memory_entries` table

This is useful for testing the complete flow and validating that all components work together.

## Endpoint

```
POST /api/test/batch-extract
```

## Request Body

```typescript
{
  maxEmails?: number;          // Max emails to fetch (default: 10)
  userId?: string;             // Email to impersonate (default: "bob@matsuoka.com")
  daysSince?: number;          // Fetch emails from last N days (default: 30)
  excludePromotions?: boolean; // Exclude promotional emails (default: true)
}
```

## Response

```typescript
{
  success: boolean;
  summary: {
    emailsFetched: number;      // Total emails fetched from Gmail
    emailsProcessed: number;    // Emails that went through extraction
    entriesStored: number;      // Entries saved to database
    totalEntities: number;      // Total entities extracted
    totalCost: number;          // Total API cost ($)
    costPerEmail: number;       // Average cost per email ($)
    entitiesPerEmail: number;   // Average entities per email
    entityTypeCounts: {         // Count by entity type
      person: number;
      company: number;
      project: number;
      // ... etc
    };
  };
  results: Array<{
    emailId: string;
    subject: string;
    from: string;
    date: string;
    entityCount: number;
    spam: {
      isSpam: boolean;
      spamScore: number;
      spamReason?: string;
    };
    cost: number;
    entities: Entity[];
  }>;
}
```

## Usage Examples

### Using curl

```bash
curl -X POST http://localhost:3000/api/test/batch-extract \
  -H "Content-Type: application/json" \
  -d '{
    "maxEmails": 5,
    "userId": "bob@matsuoka.com",
    "daysSince": 30,
    "excludePromotions": true
  }'
```

### Using the test script

```bash
./scripts/test-batch-extract.sh
```

### Using custom user

```bash
curl -X POST http://localhost:3000/api/test/batch-extract \
  -H "Content-Type: application/json" \
  -d '{
    "maxEmails": 20,
    "userId": "your-email@yourdomain.com",
    "daysSince": 7
  }'
```

## Prerequisites

### 1. Service Account Configuration

Ensure your service account is configured with domain-wide delegation:

```bash
# Set in .env or .env.local
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./config/service-account-key.json
```

### 2. Database Connection

Ensure your database is connected and migrated:

```bash
# Set in .env or .env.local
DATABASE_URL=postgresql://user:password@host:5432/database

# Run migrations if needed
npm run db:push
```

### 3. AI API Key

Ensure you have an OpenRouter API key configured:

```bash
# Set in .env or .env.local
OPENROUTER_API_KEY=sk-or-v1-...
```

## What Gets Stored

Each email with extracted entities creates a `memory_entry` with:

- **content**: Full email text + extracted entities (JSON)
- **summary**: Quick summary of entities found
- **metadata**:
  - `source`: "email_extraction"
  - `emailId`: Gmail message ID
  - `subject`: Email subject
  - `from`: Sender email
  - `date`: Email date
  - `entities`: Extracted entities array
  - `extractionModel`: AI model used
  - `extractionCost`: API cost
  - `spam`: Spam classification
  - `entityTypes`: Unique entity types found
  - `entityCount`: Total entities
- **importance**: 1-10 scale (spam=1, normal=7)
- **embedding**: NULL (to be added later)

## Verification

### Check database entries

```sql
-- Count entries created
SELECT COUNT(*) FROM memory_entries WHERE metadata->>'source' = 'email_extraction';

-- View recent entries
SELECT id, summary, metadata->>'subject', metadata->>'entityCount', created_at
FROM memory_entries
WHERE metadata->>'source' = 'email_extraction'
ORDER BY created_at DESC
LIMIT 10;

-- Check entity type distribution
SELECT metadata->>'entityTypes', COUNT(*)
FROM memory_entries
WHERE metadata->>'source' = 'email_extraction'
GROUP BY metadata->>'entityTypes';
```

### Check extraction costs

```sql
-- Total cost of all extractions
SELECT SUM((metadata->>'extractionCost')::numeric) as total_cost
FROM memory_entries
WHERE metadata->>'source' = 'email_extraction';

-- Average cost per email
SELECT AVG((metadata->>'extractionCost')::numeric) as avg_cost
FROM memory_entries
WHERE metadata->>'source' = 'email_extraction';
```

## Error Handling

The endpoint includes comprehensive error handling:

- **Authentication errors**: Service account auth failures
- **Gmail API errors**: Rate limits, permissions, etc.
- **Extraction errors**: AI model failures (returns empty entities)
- **Database errors**: Connection, insert failures

All errors are logged with full stack traces and returned in the response.

## Performance Notes

- **Rate limiting**: Gmail API has rate limits (~250 requests/user/second)
  - The GmailService includes 100ms delay between requests
- **Extraction speed**: ~1-2 seconds per email (depends on AI API)
- **Cost**: ~$0.0001-0.0005 per email (Mistral Small via OpenRouter)
- **Memory**: Processes sequentially to avoid memory issues

## Development Tips

### Test with small batches first

```bash
# Start with 1 email to verify setup
curl -X POST http://localhost:3000/api/test/batch-extract \
  -H "Content-Type: application/json" \
  -d '{"maxEmails": 1}'
```

### Check logs

The endpoint logs all steps:
- Email fetching progress
- Entity extraction (batch stats)
- Database insertions
- Final summary

### Verify results incrementally

After each run, query the database to verify entries were created correctly.

## Next Steps

Once this endpoint works, you can:

1. **Add embeddings**: Generate and store vector embeddings for semantic search
2. **Add Inngest integration**: Move to async processing with Inngest
3. **Add incremental sync**: Track last processed email to avoid duplicates
4. **Add user sessions**: Associate extractions with authenticated users
5. **Add filtering**: Filter by entity types, confidence scores, etc.

## Related Files

- Implementation: `/src/app/api/test/batch-extract/route.ts`
- Gmail Service: `/src/lib/google/gmail.ts`
- Entity Extractor: `/src/lib/extraction/entity-extractor.ts`
- Database Schema: `/src/lib/db/schema.ts`
- Test Script: `/scripts/test-batch-extract.sh`
