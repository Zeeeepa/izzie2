# Extraction Pause API Fix

## Problem
The `/api/extraction/pause` endpoint required a `source` field in the request body, but the dashboard's `handlePause` function was calling it without a body, causing "Invalid source" errors.

## Solution
Modified the pause API to support two modes of operation:

### 1. Pause Specific Source
When a `source` is provided in the request body:
```typescript
POST /api/extraction/pause
{
  "source": "email"  // or "calendar" or "drive"
}
```
- Validates the source is one of: email, calendar, drive
- Checks if extraction is running for that source
- Pauses only that specific source
- Returns the updated progress for that source

### 2. Pause All Running Extractions
When NO `source` is provided (empty body or no body):
```typescript
POST /api/extraction/pause
// No body or empty body
```
- Iterates through all sources: email, calendar, drive
- Checks each source's extraction status
- Pauses any sources that are currently running
- Returns a summary of all sources and what was paused

**Response:**
```json
{
  "success": true,
  "message": "Paused 1 extraction(s): email",
  "pausedSources": ["email"],
  "results": {
    "email": {
      "success": true,
      "previousStatus": "running",
      "currentStatus": "paused"
    },
    "calendar": {
      "success": false,
      "reason": "Not running (status: idle)",
      "currentStatus": "idle"
    },
    "drive": {
      "success": false,
      "reason": "Not running (status: idle)",
      "currentStatus": "idle"
    }
  }
}
```

## Reset Script
Created `scripts/reset-extraction-status.ts` to reset stuck "running" statuses:

```bash
npx tsx scripts/reset-extraction-status.ts
```

This script:
- Finds all extractions with status "running"
- Sets them to "idle"
- Clears any error messages
- Reports what was reset

## Verification Script
Created `scripts/check-extraction-status.ts` to view current extraction statuses:

```bash
npx tsx scripts/check-extraction-status.ts
```

Shows:
- All extraction progress records
- Current status for each source
- Progress counters (total, processed, failed, entities)
- Last run timestamp

## Changes Made

### `/src/app/api/extraction/pause/route.ts`
- Added logic to handle missing `source` parameter
- When no source provided, loop through all sources and pause any that are running
- Return detailed results showing what was paused
- Maintain backward compatibility with specific source pausing

### New Scripts
- `scripts/reset-extraction-status.ts` - Reset stuck running statuses
- `scripts/check-extraction-status.ts` - View current statuses

## Usage

### Dashboard (No Source)
The dashboard can now call pause without a body:
```typescript
const handlePause = async () => {
  const response = await fetch('/api/extraction/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No body - pauses all running extractions
  });
};
```

### Programmatic (Specific Source)
Can still pause a specific source:
```typescript
const response = await fetch('/api/extraction/pause', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'email' }),
});
```

## Testing
Verified:
- ✅ Reset script successfully reset 1 stuck "running" extraction to "idle"
- ✅ Status check shows email extraction is now "idle"
- ✅ API supports both modes (with/without source parameter)

## Next Steps
1. Test the pause button in the dashboard to verify it works without errors
2. Consider updating the dashboard to show which sources were paused
3. Add frontend feedback showing the results of the pause operation
