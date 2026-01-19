# Extraction Status Fix - Implementation Summary

**Date**: January 18, 2026
**Issue**: Dashboard showing misleading "running" status for Calendar and Google Drive extractions with 0/0 progress

## Problem Analysis

### Root Causes Identified

1. **Stale "running" status**: Calendar and Drive extractions were stuck in "running" state from January 16 (2+ days ago) with:
   - 0 total items
   - 0 processed items
   - No actual background process active

2. **No stale detection**: The status API (`/api/extraction/status`) didn't check if a "running" extraction was actually active

3. **Missing progress updates**: Calendar/Drive sync endpoints had their own in-memory `syncStatus` but didn't update the `extraction_progress` database table

4. **No cleanup mechanism**: No automatic reset of stuck extractions on startup or timeout

### Database State (Before Fix)

```sql
-- Calendar: stuck in "running" since Jan 16
{
  "source": "calendar",
  "status": "running",  -- MISLEADING
  "lastRunAt": "2026-01-16T21:35:52.244Z",  -- 2 days ago
  "totalItems": 0,
  "processedItems": 0
}

-- Drive: stuck in "running" since Jan 16
{
  "source": "drive",
  "status": "running",  -- MISLEADING
  "lastRunAt": "2026-01-16T21:35:52.462Z",  -- 2 days ago
  "totalItems": 0,
  "processedItems": 0
}
```

## Implementation Details

### 1. Stale Detection Logic (`src/lib/extraction/progress.ts`)

Added three new functions to detect and handle stale extractions:

#### `isExtractionStale(progress: ExtractionProgress): boolean`
- Detects extractions stuck in "running" state
- Rules:
  - Status is "running" AND
  - No `lastRunAt` timestamp OR
  - No activity for more than 5 minutes

```typescript
export function isExtractionStale(progress: ExtractionProgress): boolean {
  if (progress.status !== 'running') return false;
  if (!progress.lastRunAt) return true; // Stuck - no lastRunAt

  const minutesSinceLastRun = (Date.now() - new Date(progress.lastRunAt).getTime()) / (1000 * 60);
  return minutesSinceLastRun > 5; // Stale after 5 minutes
}
```

#### `getEffectiveStatus(progress: ExtractionProgress): ExtractionStatus`
- Returns effective status for UI display
- Marks stale extractions as "error" without modifying database
- Used by status API to show accurate state

#### `resetStaleExtractions(): Promise<number>`
- Finds all stale extractions across all users
- Updates their status to "error"
- Returns count of reset extractions
- Used for cleanup operations

### 2. Status API Enhancement (`src/app/api/extraction/status/route.ts`)

Updated status API to use effective status:

```typescript
const progressWithMetrics = allProgress.map((progress) => {
  const effectiveStatus = getEffectiveStatus(progress);

  return {
    ...progress,
    status: effectiveStatus,        // Use effective status (marks stale as error)
    originalStatus: progress.status, // Keep original for debugging
    progressPercentage: percentage,
    processingRate,
    estimatedSecondsRemaining,
  };
});
```

**Before Fix**: API returned `status: "running"` for stuck extractions
**After Fix**: API returns `status: "error"` for stale extractions

### 3. Manual Reset Endpoint (`src/app/api/extraction/reset-stale/route.ts`)

Created new endpoint for manual cleanup:

```
POST /api/extraction/reset-stale
```

**Purpose**: Manually reset all stuck extractions (useful for debugging and recovery)

**Response**:
```json
{
  "success": true,
  "message": "Reset 2 stale extractions",
  "resetCount": 2
}
```

**Security**: Requires authentication via `requireAuth(request)`

### 4. Automatic Startup Cleanup

#### Instrumentation Hook (`src/instrumentation.ts`)
- Runs once when Next.js server starts
- Automatically resets any stale extractions on startup
- Prevents accumulation of stuck states

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const resetCount = await resetStaleExtractions();
    if (resetCount > 0) {
      console.log(`[Instrumentation] Reset ${resetCount} stale extraction(s) on startup`);
    }
  }
}
```

#### Next.js Configuration (`next.config.ts`)
- Enabled instrumentation hook:

```typescript
experimental: {
  instrumentationHook: true,
}
```

### 5. Calendar Sync Progress Tracking (`src/app/api/calendar/sync/route.ts`)

Fixed calendar sync to update `extraction_progress` table:

**Before**: Only updated in-memory `syncStatus`
**After**:
- Updates `extraction_progress` table during sync
- Marks as "completed" on success
- Marks as "error" on failure

```typescript
// During sync
await updateCounters(userId, 'calendar', {
  totalItems: totalProcessed,
  processedItems: totalProcessed,
});

// On completion
await completeExtraction(userId, 'calendar', {
  oldestDate: timeMin,
  newestDate: timeMax,
});

// On error
await markExtractionError(userId, 'calendar');
```

## Test Results

Ran comprehensive test (`scripts/test-stuck-extraction.ts`):

### Test Scenario
1. Created stuck extraction (calendar with `lastRunAt` = 10 minutes ago)
2. Tested stale detection
3. Tested reset functionality
4. Verified database state after reset

### Results
```
✅ PASS: Calendar correctly detected as stale
✅ PASS: Effective status correctly set to error
✅ PASS: resetStaleExtractions found and reset stuck extractions (1 extraction)
✅ PASS: Status correctly updated to error after reset
```

### Before Fix (Status API Response)
```json
{
  "source": "calendar",
  "status": "running",        // ❌ MISLEADING
  "totalItems": 0,
  "processedItems": 0,
  "lastRunAt": "2026-01-16T21:35:52.244Z"
}
```

### After Fix (Status API Response)
```json
{
  "source": "calendar",
  "status": "error",          // ✅ ACCURATE
  "originalStatus": "running",
  "totalItems": 0,
  "processedItems": 0,
  "lastRunAt": "2026-01-16T21:35:52.244Z"
}
```

## Files Modified

### Core Library
- `src/lib/extraction/progress.ts` - Added stale detection functions

### API Routes
- `src/app/api/extraction/status/route.ts` - Use effective status
- `src/app/api/extraction/reset-stale/route.ts` - NEW: Manual reset endpoint
- `src/app/api/calendar/sync/route.ts` - Update extraction_progress table

### Infrastructure
- `src/instrumentation.ts` - NEW: Startup cleanup
- `next.config.ts` - Enable instrumentation hook

### Testing
- `scripts/test-stuck-extraction.ts` - NEW: Comprehensive test script

## Deployment Checklist

- [x] Stale detection implemented and tested
- [x] Status API returns accurate status
- [x] Manual reset endpoint available
- [x] Automatic startup cleanup enabled
- [x] Calendar sync updates database
- [x] All tests passing

## Usage

### For Users
- Dashboard now shows accurate extraction status
- Stuck extractions automatically detected and marked as "error"
- Can retry failed extractions (previously stuck as "running")

### For Developers
- Manual reset: `POST /api/extraction/reset-stale`
- Check stale extractions: `isExtractionStale(progress)`
- Get effective status: `getEffectiveStatus(progress)`
- Test script: `npx tsx scripts/test-stuck-extraction.ts`

## Known Limitations

1. **Drive Sync Not Integrated**: Drive ingestion uses Inngest with separate sync state system (`/src/lib/ingestion/sync-state.ts`). Future work needed to integrate with `extraction_progress` table.

2. **5-Minute Timeout**: Stale detection uses 5-minute threshold. Long-running extractions (>5 min) may be incorrectly marked as stale. Consider making timeout configurable if needed.

3. **In-Memory syncStatus**: Calendar sync still maintains in-memory `syncStatus` for backward compatibility. This could be removed in future refactor.

## Future Improvements

1. **Integrate Drive with extraction_progress**: Update Drive Inngest functions to use `extraction_progress` table
2. **Configurable Timeout**: Add environment variable for stale detection timeout
3. **Progress Webhooks**: Notify UI when extraction status changes (WebSocket/SSE)
4. **Metrics Dashboard**: Track extraction success/failure rates over time
5. **Auto-Retry Logic**: Automatically retry failed extractions with exponential backoff

## Conclusion

The extraction status is now accurate and reliable:
- ✅ Stale extractions automatically detected
- ✅ Status API shows effective status
- ✅ Manual reset available for debugging
- ✅ Automatic cleanup on startup
- ✅ Calendar sync updates database properly

Users will no longer see misleading "running" status with 0/0 progress.
