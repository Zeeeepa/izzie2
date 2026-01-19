# Dashboard Extraction UI Update

## Summary
Updated `/src/app/dashboard/page.tsx` to use the new extraction API with real-time progress tracking and professional UI.

## Changes Made

### 1. New Types and Constants
- Added `ExtractionStatus` and `ExtractionSource` types
- Added `SourceProgress` interface matching API response
- Added `SOURCE_LABELS`, `SOURCE_ICONS`, and `STATUS_COLORS` for UI consistency

### 2. State Management
- Replaced `syncing` state with `progress` array for all sources
- Added `loading` state for initial fetch
- Removed old sync status tracking

### 3. Progress Tracking
- **Auto-refresh**: Polls `/api/extraction/status` every 2 seconds while sources are running
- **useEffect hook**: Fetches initial status and sets up polling interval
- **Smart polling**: Only polls when sources are actively running

### 4. New Progress UI Components

#### Progress Bars
Each source (email, calendar, drive) displays:
- **Icon + Name**: Visual identifier with source label
- **Status Badge**: Color-coded badge (idle, running, paused, completed, error)
- **Progress Bar**: Animated 0-100% visual indicator
- **Stats Row**:
  - Progress percentage
  - Processed/total items
  - Entities extracted count
  - Failed items count (if any)

#### Status Colors
- **Idle**: Gray (#f3f4f6)
- **Running**: Blue (#dbeafe)
- **Paused**: Yellow (#fef3c7)
- **Completed**: Green (#d1fae5)
- **Error**: Red (#fee2e2)

### 5. Control Functions

#### `handleStart()`
- Starts extraction for selected sources
- Calls `POST /api/extraction/start`
- Passes selected sources and date range

#### `handlePause()`
- Pauses all running extractions
- Calls `POST /api/extraction/pause`
- Only visible when sources are running

#### `handleReset()`
- Resets all extraction progress
- Calls `POST /api/extraction/reset`
- Requires confirmation
- Disabled while extraction is running

### 6. Smart UI Updates

#### Button States
- **Start/Resume**: Shows "Start Extraction" or "Resume" based on paused state
- **Pause**: Only visible while extraction is running
- **Reset**: Disabled while running, requires confirmation

#### Source/Date Controls
- Disabled while extraction is running
- Visual opacity change to indicate disabled state
- Prevents configuration changes mid-extraction

## API Integration

### GET /api/extraction/status
```typescript
{
  success: true,
  progress: [
    {
      id: string,
      source: 'email' | 'calendar' | 'drive',
      status: 'idle' | 'running' | 'paused' | 'completed' | 'error',
      totalItems: number,
      processedItems: number,
      failedItems: number,
      entitiesExtracted: number,
      progressPercentage: number,
      // ... other fields
    }
  ]
}
```

### POST /api/extraction/start
```typescript
{
  sources: string[],  // ['email', 'calendar', 'drive']
  days?: number       // 7, 30, 90, or undefined for all
}
```

### POST /api/extraction/pause
No body required

### POST /api/extraction/reset
No body required

## User Experience

### Real-time Updates
- Progress bars animate smoothly (0.3s transition)
- Stats update every 2 seconds while running
- No manual refresh needed

### Visual Feedback
- Color-coded status badges
- Progress bars show completion percentage
- Failed item counts highlighted in red
- Hover effects on all buttons

### Professional Look
- Clean, modern design
- Consistent spacing and sizing
- Responsive layout
- Clear visual hierarchy

## File Stats
- **Total Lines**: 757 lines (within 800 line limit)
- **No TypeScript Errors**: Verified with `tsc --noEmit`
- **Follows Patterns**: Matches existing dashboard card style

## Testing Checklist
- [ ] Initial status load shows all sources
- [ ] Start button begins extraction
- [ ] Progress bars update in real-time
- [ ] Pause button stops extraction
- [ ] Resume continues from paused state
- [ ] Reset clears all progress
- [ ] Status messages display correctly
- [ ] Controls disable while running
- [ ] Polling stops when no sources running
