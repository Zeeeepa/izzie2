# Extraction Status Display Fix - Summary

## ✅ Fix Completed

Fixed the dashboard UI showing incorrect "error" status for Calendar and Drive extractions.

## Changes Made

### File: `src/lib/extraction/progress.ts`

#### 1. Fixed Stale Detection (Line 239-255)
**Changed:** `isExtractionStale()` now uses `updatedAt` instead of `lastRunAt`

**Before:**
```typescript
const lastRun = new Date(progress.lastRunAt);
const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
return minutesSinceLastRun > 5; // ❌ Used wrong timestamp
```

**After:**
```typescript
const lastUpdate = new Date(progress.updatedAt);
const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
return minutesSinceLastUpdate > 5; // ✅ Uses correct timestamp
```

**Why:** `lastRunAt` is set when extraction starts, but `updatedAt` is updated with every progress update. This accurately reflects whether an extraction is actively running.

#### 2. Fixed Progress Calculation (Line 207-221)
**Changed:** `calculateProgress()` now handles `total_items=0` with `processed_items > 0`

**Before:**
```typescript
if (!progress.totalItems || progress.totalItems === 0) {
  return 0; // ❌ Always 0% if total unknown
}
```

**After:**
```typescript
// If we have processed items but no total, consider it complete (100%)
if ((!progress.totalItems || progress.totalItems === 0) && progress.processedItems > 0) {
  return 100; // ✅ Show 100% for active processing
}

// No total items and no processed items = not started
if (!progress.totalItems || progress.totalItems === 0) {
  return 0;
}
```

**Why:** Some extractions (like Calendar) process items without knowing total count upfront. Showing 0% for active processing is misleading.

## Expected Results

### Before Fix:
```
📧 Gmail - completed, Progress: 100%, Items: 21/21, Entities: 93
📅 Calendar - error, Progress: 0%, Items: 57/0, Entities: 233  ❌
📁 Drive - error, Progress: 0%, Items: 0/0, Entities: 0  ❌
```

### After Fix:
```
📧 Gmail - completed, Progress: 100%, Items: 21/21, Entities: 93
📅 Calendar - running, Progress: 100%, Items: 57/0, Entities: 233  ✅
📁 Drive - idle, Progress: 0%, Items: 0/0, Entities: 0  ✅
```

## Testing

Run the test script:
```bash
node test-extraction-status-fix.mjs
```

## Next Steps

1. Restart dev server: `npm run dev`
2. Navigate to `/dashboard`
3. Verify Calendar shows "running" (not "error")
4. Verify Calendar shows 100% progress (not 0%)
5. Verify Drive shows "idle" (not "error")

## Technical Details

See `EXTRACTION-STATUS-FIX.md` for detailed analysis and implementation notes.
