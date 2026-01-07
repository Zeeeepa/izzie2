# Gmail Sync Progress Tracking Integration

## Summary

Integrated progress tracking into the Gmail sync endpoint (`/api/gmail/sync-user`) to provide real-time visibility into email synchronization status.

## Changes Made

### File Modified
- **`src/app/api/gmail/sync-user/route.ts`**

### Key Integration Points

#### 1. **Imports Added**
```typescript
import {
  getOrCreateProgress,
  updateProgress,
  startExtraction,
  completeExtraction,
  updateCounters,
  markExtractionError,
} from '@/lib/extraction/progress';
```

#### 2. **Sync Initialization** (Lines 214-226)
- Calculate date range (default 30 days if not specified)
- Create/get progress record
- Mark extraction as 'running' with date range
- Log progress tracking start

```typescript
const endDate = new Date();
const startDate = sinceDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

await getOrCreateProgress(userId, 'email');
await startExtraction(userId, 'email', startDate, endDate);
```

#### 3. **Pause Detection** (Lines 234-240)
- Check for pause requests before each batch
- Gracefully exit if user paused the sync

```typescript
const currentProgress = await getOrCreateProgress(userId, 'email');
if (currentProgress.status === 'paused') {
  console.log('[Gmail Sync User] Sync paused by user');
  syncStatus.isRunning = false;
  return;
}
```

#### 4. **Progress Updates During Processing** (Lines 310-321)
- Increment counters for each email processed
- Update progress every 10 emails for efficiency
- Track entities extracted count

```typescript
totalProcessed++;
entitiesCount++;

if (totalProcessed % 10 === 0 || totalProcessed === maxResults) {
  await updateCounters(userId, 'email', {
    processedItems: totalProcessed,
    entitiesExtracted: entitiesCount,
  });
}
```

#### 5. **Error Handling** (Lines 327-336)
- Track failed items when email processing fails
- Continue processing remaining emails
- Increment failedItems counter

```typescript
catch (error) {
  console.error(`[Gmail Sync User] Error processing message ${message.id}:`, error);

  await updateCounters(userId, 'email', {
    failedItems: currentProgress.failedItems + 1,
  });
}
```

#### 6. **Completion** (Lines 352-376)
- Mark extraction as completed
- Update final counters
- Log completion summary

```typescript
await completeExtraction(userId, 'email', {
  oldestDate: startDate,
  newestDate: endDate,
});

await updateCounters(userId, 'email', {
  totalItems: totalProcessed,
  processedItems: totalProcessed,
  entitiesExtracted: entitiesCount,
});
```

#### 7. **Error Status** (Lines 377-386)
- Mark extraction as error if sync fails
- Preserve error message
- Re-throw error for proper handling

```typescript
catch (error) {
  await markExtractionError(userId, 'email');

  syncStatus.isRunning = false;
  syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
  throw error;
}
```

## Progress Tracking Fields

The integration updates the following fields in the `extraction_progress` table:

- **status**: 'idle' → 'running' → 'completed' | 'paused' | 'error'
- **currentChunkStart**: Start date of sync range
- **currentChunkEnd**: End date of sync range
- **totalItems**: Total emails to process
- **processedItems**: Emails successfully processed
- **failedItems**: Emails that failed processing
- **entitiesExtracted**: Number of emails sent for entity extraction
- **oldestDateExtracted**: Oldest email date in sync
- **newestDateExtracted**: Newest email date in sync
- **lastRunAt**: Timestamp of sync execution

## Benefits

1. **Real-time Progress**: UI can display current sync status
2. **Pause/Resume**: Sync respects user pause requests
3. **Error Tracking**: Failed items are counted and logged
4. **Date Watermarks**: Track which date ranges have been synced
5. **Performance Monitoring**: Track sync duration and throughput

## Testing Checklist

- [ ] Sync starts with correct date range
- [ ] Progress updates every 10 emails
- [ ] Pause functionality works mid-sync
- [ ] Failed emails increment failedItems counter
- [ ] Completion updates all final counters
- [ ] Error status is set when sync fails
- [ ] Progress persists across API calls

## Related Files

- `/src/lib/extraction/progress.ts` - Progress management utilities
- `/src/lib/db/schema.ts` - `extraction_progress` table schema
- `/src/app/api/gmail/sync-user/route.ts` - Main sync endpoint

## Next Steps

1. Update UI to display sync progress from `extraction_progress` table
2. Add API endpoint to fetch current progress: `GET /api/extraction/progress?source=email`
3. Add pause/resume API endpoints
4. Consider adding estimated time remaining based on processing rate
