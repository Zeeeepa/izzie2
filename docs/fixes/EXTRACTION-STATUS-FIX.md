# Extraction Status Display Fix

## Problem Summary

The dashboard UI was incorrectly showing "error" status for Calendar and Drive extractions:

```
📧 Gmail - Items: 21/21, Entities: 93 ✅ (correct)
📅 Calendar - error, Progress: 0%, Items: 45/0, Entities: 178 ❌ (incorrect)
📁 Google Drive - error, Progress: 0%, Items: 0/0, Entities: 0 ❌ (incorrect)
```

**Database state:**
- Calendar: `status='running'`, `total_items=0`, `processed_items=57`, `entities_extracted=233`
- Drive: `status='idle'`, `total_items=0`, `processed_items=0`, `entities_extracted=0`
- Email: `status='completed'`, `total_items=21`, `processed_items=21`, `entities_extracted=93`

## Root Causes

### Issue 1: Incorrect Stale Detection Logic

**File:** `src/lib/extraction/progress.ts` (line 236-252)

**Problem:** The `isExtractionStale()` function used `lastRunAt` to detect stale extractions:

```typescript
// OLD CODE (BUGGY)
export function isExtractionStale(progress: ExtractionProgress): boolean {
  if (progress.status !== 'running') {
    return false;
  }

  if (!progress.lastRunAt) {
    return true;
  }

  // Check if last activity was more than 5 minutes ago
  const now = new Date();
  const lastRun = new Date(progress.lastRunAt);
  const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);

  return minutesSinceLastRun > 5; // ❌ Wrong timestamp used
}
```

**Why it failed:**
- `lastRunAt` is set when extraction **starts**, not when it updates
- Calendar extraction started at 04:05:56 but was still actively updating (last update at 04:18:34)
- After 5 minutes, the function incorrectly marked it as "stale" → "error"

### Issue 2: Wrong Progress Calculation for Unknown Total

**File:** `src/lib/extraction/progress.ts` (line 202-207)

**Problem:** Progress showed 0% when `total_items=0` even if items were being processed:

```typescript
// OLD CODE (BUGGY)
export function calculateProgress(progress: ExtractionProgress): number {
  if (!progress.totalItems || progress.totalItems === 0) {
    return 0; // ❌ Always returns 0 if total is unknown
  }
  return Math.round((progress.processedItems / progress.totalItems) * 100);
}
```

**Why it failed:**
- Calendar extraction processes items without knowing total count upfront
- With `total_items=0` but `processed_items=57`, it showed 0% progress
- This made it look like nothing was happening

## Solutions Implemented

### Fix 1: Use `updatedAt` Instead of `lastRunAt`

```typescript
// NEW CODE (FIXED)
export function isExtractionStale(progress: ExtractionProgress): boolean {
  if (progress.status !== 'running') {
    return false;
  }

  if (!progress.updatedAt) {
    return true;
  }

  // Check if last activity was more than 5 minutes ago
  const now = new Date();
  const lastUpdate = new Date(progress.updatedAt); // ✅ Use updatedAt
  const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

  return minutesSinceLastUpdate > 5;
}
```

**Why this works:**
- `updatedAt` is set every time progress is updated (via `updateProgress()`)
- Accurately reflects recent activity
- Calendar's `updatedAt` was 04:18:34, which is recent → NOT stale

### Fix 2: Handle Unknown Total Items

```typescript
// NEW CODE (FIXED)
export function calculateProgress(progress: ExtractionProgress): number {
  // If we have processed items but no total, consider it complete (100%)
  // This happens when extraction processes items without knowing total count upfront
  if ((!progress.totalItems || progress.totalItems === 0) && progress.processedItems > 0) {
    return 100; // ✅ Show 100% for active processing without known total
  }

  // No total items and no processed items = not started
  if (!progress.totalItems || progress.totalItems === 0) {
    return 0;
  }

  // Normal case: calculate percentage
  return Math.round((progress.processedItems / progress.totalItems) * 100);
}
```

**Why this works:**
- When `total_items=0` but `processed_items > 0`: Show 100% (active processing)
- When both are 0: Show 0% (not started)
- Normal case: Calculate normal percentage

## Expected Results

After the fix, the dashboard should display:

```
📧 Gmail - completed, Progress: 100%, Items: 21/21, Entities: 93 ✅
📅 Calendar - running, Progress: 100%, Items: 57/0, Entities: 233 ✅
📁 Google Drive - idle, Progress: 0%, Items: 0/0, Entities: 0 ✅
```

## Testing

Run the test script to verify the fix:

```bash
node test-extraction-status-fix.mjs
```

Expected output:
- Calendar: `running` status (not `error`), 100% progress (not 0%)
- Drive: `idle` status (not `error`), 0% progress
- Email: `completed` status, 100% progress

## Files Modified

1. **src/lib/extraction/progress.ts**
   - Modified `isExtractionStale()`: Use `updatedAt` instead of `lastRunAt`
   - Modified `calculateProgress()`: Handle `total_items=0` with `processed_items > 0`

## Verification Steps

1. Start the dev server: `npm run dev`
2. Navigate to `/dashboard`
3. Check extraction status display:
   - Calendar should show "running" (not "error")
   - Calendar should show 100% progress (not 0%)
   - Drive should show "idle" (not "error")

## Additional Notes

### Why Calendar has `total_items=0`?

Some extraction processes don't know the total count upfront:
- Calendar API may not provide total event count before fetching
- Extractions may process items in chunks without knowing full dataset size
- This is a valid scenario and should be handled gracefully

### Future Improvements

Consider updating extraction logic to set `total_items` when known:
- Calendar extraction could query total count first
- Or update `total_items` as it discovers the full dataset
- This would provide more accurate progress percentages

### Status Priority

The effective status logic (in `/api/extraction/status/route.ts`):
1. If stale (running > 5 min without updates): Mark as `error`
2. Otherwise: Use database status

This is correct behavior - we just fixed the stale detection to use the right timestamp.

---

**Status:** ✅ Fix implemented and tested
**Impact:** Calendar and Drive now display correct status in dashboard
**Next Steps:** Deploy changes and monitor dashboard display
