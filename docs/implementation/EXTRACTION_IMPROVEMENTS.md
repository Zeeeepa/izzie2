# Extraction Improvements Summary

## Overview
Fixed logging issues and added incremental extraction tracking to the Gmail entity extraction system.

## Changes Made

### 1. Fixed Weaviate Logging Issue
**File**: `src/lib/weaviate/entities.ts`

**Problem**:
- Logging showed "Saved 0 entities" even when entities were successfully saved
- The code was incorrectly treating `result.uuids` as an array when it's actually an object/dictionary

**Solution**:
```typescript
// Before (incorrect)
const insertedCount = result.uuids?.length || 0;

// After (correct)
const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;
```

**Impact**:
- Now correctly displays the actual number of entities saved to Weaviate
- Provides accurate logging for debugging and monitoring

### 2. Added dotenv/config Import
**File**: `scripts/extract-gmail-entities.ts`

**Change**:
```typescript
import 'dotenv/config';  // Added at the top of the file
```

**Impact**:
- Auto-loads environment variables from `.env.local`
- Users no longer need to manually specify environment variables
- Simplifies script execution

### 3. Implemented Incremental Extraction Tracking

**Database Schema** (already in place):
The `extraction_progress` table has watermark fields:
- `oldestDateExtracted`: Tracks the oldest email date processed
- `newestDateExtracted`: Tracks the newest email date processed

**New Script Features**:

#### Added `--incremental` Flag
```bash
# Full extraction (default) - uses --since days
npx tsx scripts/extract-gmail-entities.ts --since 7

# Incremental extraction - only new emails since last run
npx tsx scripts/extract-gmail-entities.ts --incremental
```

#### How It Works

1. **Check Previous Progress**:
   - Queries `extraction_progress` table for user's last extraction
   - Retrieves `newestDateExtracted` timestamp

2. **Determine Date Range**:
   - **Incremental mode**: Fetches emails after `newestDateExtracted`
   - **Full mode**: Fetches emails from last N days (default: 7)

3. **Track Actual Email Dates**:
   - Records the oldest and newest email dates from processed emails
   - Updates watermarks in the database after extraction completes

4. **Update Watermarks**:
   ```typescript
   await completeExtraction(userId, 'email', {
     oldestDate: actualOldestEmailDate,
     newestDate: actualNewestEmailDate,
     totalCost: totalCostInCents,
   });
   ```

#### Code Changes

**Added to Args Interface**:
```typescript
interface Args {
  user?: string;
  limit: number;
  since: number;
  incremental: boolean;  // NEW
  skipWeaviate: boolean;
  help: boolean;
}
```

**Date Range Calculation**:
```typescript
if (options.incremental && existingProgress.newestDateExtracted) {
  // Incremental: only fetch emails newer than last extraction
  sinceDate = new Date(existingProgress.newestDateExtracted);
  console.log(`🔄 Incremental mode: fetching emails since last extraction`);
} else {
  // Full: use --since parameter
  sinceDate = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000);
  console.log(`📅 Full extraction: fetching emails from last ${options.sinceDays} days`);
}
```

**Email Date Tracking**:
```typescript
// Track actual email date boundaries
let oldestEmailDate: Date | null = null;
let newestEmailDate: Date | null = null;

// For each processed email:
const emailDate = new Date(date);
if (!oldestEmailDate || emailDate < oldestEmailDate) {
  oldestEmailDate = emailDate;
}
if (!newestEmailDate || emailDate > newestEmailDate) {
  newestEmailDate = emailDate;
}

// Use actual dates for watermarks
const finalOldestDate = oldestEmailDate || sinceDate;
const finalNewestDate = newestEmailDate || endDate;
```

## Usage Examples

### First Run (Full Extraction)
```bash
# Extract last 14 days of emails
npx tsx scripts/extract-gmail-entities.ts --since 14
```

Database after run:
```
extraction_progress:
  oldestDateExtracted: 2026-01-03T00:00:00Z
  newestDateExtracted: 2026-01-17T23:59:59Z
```

### Subsequent Run (Incremental)
```bash
# Only fetch emails newer than 2026-01-17T23:59:59Z
npx tsx scripts/extract-gmail-entities.ts --incremental
```

Gmail query generated:
```
after:1705536000  # Timestamp of newestDateExtracted
```

### Specific User with Incremental
```bash
npx tsx scripts/extract-gmail-entities.ts --user john@example.com --incremental
```

## Benefits

### 1. Accurate Logging
- ✅ Weaviate entity counts now display correctly
- ✅ Better debugging and monitoring

### 2. Simplified Configuration
- ✅ Auto-loads `.env.local` via dotenv
- ✅ No need to manually pass environment variables

### 3. Efficient Incremental Extraction
- ✅ Only processes new emails since last run
- ✅ Saves API quota (Gmail API has daily limits)
- ✅ Reduces extraction time for regular runs
- ✅ Lower LLM costs (fewer emails to process)

### 4. Accurate Watermarking
- ✅ Tracks actual email dates (not just query boundaries)
- ✅ Prevents duplicate processing
- ✅ Reliable incremental sync

## Files Modified

1. **src/lib/weaviate/entities.ts**
   - Fixed entity count logging (1 line change)

2. **scripts/extract-gmail-entities.ts**
   - Added `dotenv/config` import
   - Added `--incremental` flag
   - Implemented date range logic for incremental mode
   - Added email date boundary tracking
   - Updated watermark persistence

## Testing Recommendations

### Test 1: Verify Weaviate Logging
```bash
npx tsx scripts/extract-gmail-entities.ts --limit 5
```
Expected: Should show "Saved X entities" with actual count (not 0)

### Test 2: Full Extraction
```bash
npx tsx scripts/extract-gmail-entities.ts --since 7
```
Check database:
```sql
SELECT oldestDateExtracted, newestDateExtracted
FROM extraction_progress
WHERE source = 'email';
```

### Test 3: Incremental Extraction
```bash
# Run twice with same user
npx tsx scripts/extract-gmail-entities.ts --user test@example.com --limit 10
npx tsx scripts/extract-gmail-entities.ts --user test@example.com --incremental --limit 5
```
Expected: Second run should only fetch emails newer than first run

### Test 4: Environment Variable Loading
```bash
# Should work without manually setting env vars
npx tsx scripts/extract-gmail-entities.ts --help
```

## Related Documentation

- **Weaviate Documentation**: [Batch Import](https://docs.weaviate.io/weaviate/manage-objects/import)
- **Database Schema**: `src/lib/db/schema.ts` (extractionProgress table)
- **Progress Tracking**: `src/lib/extraction/progress.ts`
- **Extraction Script**: `scripts/extract-gmail-entities.ts`

## LOC Delta

- **Added**: ~50 lines (incremental logic + date tracking)
- **Removed**: ~40 lines (old Neo4j references)
- **Modified**: ~20 lines (Weaviate logging fix + refactoring)
- **Net Change**: +30 lines

## Next Steps

1. Test incremental extraction with real data
2. Add progress indicators for incremental runs
3. Consider adding `--full` flag to force full re-extraction
4. Add metrics/logging for incremental extraction efficiency
5. Document watermark reset procedure (if needed)

## Notes

- The `extraction_progress` table already had watermark fields, so no schema changes were needed
- Gmail's `historyId` API could be used for even more efficient incremental sync (future enhancement)
- Consider adding a `--reset` flag to clear watermarks and force full re-extraction
