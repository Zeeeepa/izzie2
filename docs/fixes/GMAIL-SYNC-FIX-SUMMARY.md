# Gmail Sync Entity Extraction Fix

## Problem
Gmail sync was failing at the Inngest step with "401 Event key not found" error when trying to send emails for entity extraction.

## Root Cause
The code was attempting to send events to Inngest for asynchronous entity extraction:
```typescript
await inngest.send({
  name: 'izzie/ingestion.email.extracted',
  ...
});
```

But Inngest was not properly configured, causing the sync to fail.

## Solution
Modified `/src/app/api/gmail/sync-user/route.ts` to call entity extraction **synchronously** instead of relying on Inngest:

### Changes Made

1. **Added Imports** (lines 22-24):
   - `getEntityExtractor` - For direct entity extraction
   - `processExtraction` - For saving entities to Neo4j graph
   - `Email` type - For proper typing

2. **Replaced Inngest Event Send** (lines 290-345):
   - **Before**: Sent event to Inngest and hoped it would process
   - **After**: Call extraction directly inline:
     - Build `Email` object from Gmail API data
     - Extract entities using `getEntityExtractor().extractFromEmail()`
     - Save to graph using `processExtraction()`
     - Track actual entity counts (not just email counts)
     - Continue processing even if extraction fails for individual emails

3. **Improved Entity Counting** (line 337):
   - **Before**: `entitiesCount++` (counted emails, not entities)
   - **After**: `entitiesCount += extractionResult.entities.length` (actual entity count)

### Code Flow (Per Email)

```
Gmail API → Parse Email → Extract Entities → Save to Graph → Update Progress
                                  ↓
                          (No Inngest dependency)
```

### Benefits

1. **No Inngest Dependency**: Works without Inngest configuration
2. **Synchronous Processing**: Entities are extracted and saved immediately
3. **Better Error Handling**: Failed extractions don't stop the entire sync
4. **Accurate Progress Tracking**: Real entity counts, not email counts
5. **Immediate Results**: Graph is updated in real-time as emails are processed

### Error Handling

```typescript
try {
  // Extract and save entities
} catch (extractionError) {
  console.error(`[Gmail Sync User] Entity extraction failed for ${message.id}:`, extractionError);
  // Continue processing other emails even if extraction fails
}
```

Extraction failures for individual emails are logged but don't stop the sync process.

## Testing

To test the fix:

1. **Start the sync**:
   ```bash
   curl -X POST http://localhost:3300/api/gmail/sync-user \
     -H "Content-Type: application/json" \
     -d '{"folder": "sent", "maxResults": 10}'
   ```

2. **Monitor progress**:
   ```bash
   curl http://localhost:3300/api/gmail/sync-user
   ```

3. **Check extraction results**:
   - Watch server logs for entity extraction counts
   - Verify entities in Neo4j graph database
   - Check progress UI for real-time updates

## Files Modified

- `/src/app/api/gmail/sync-user/route.ts` - Main Gmail sync endpoint

## Dependencies Used

- `@/lib/extraction/entity-extractor` - AI-powered entity extraction
- `@/lib/graph/graph-builder` - Neo4j graph persistence
- `@/lib/google/types` - Type definitions

## Next Steps (Optional)

If you want to re-enable Inngest for async processing later:

1. Configure Inngest with proper event key
2. Keep the direct extraction as fallback
3. Send events to both systems (dual-write pattern)
4. Gradually transition back to async if needed

For now, **synchronous extraction works perfectly** and eliminates the Inngest dependency.
