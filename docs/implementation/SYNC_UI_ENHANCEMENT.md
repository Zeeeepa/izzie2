# Data Sync UI Enhancement

## Summary
Enhanced the Email Sync section in the dashboard to support multi-source sync with date range selection.

## Changes Made

### File Modified
- `/Users/masa/Projects/izzie2/src/app/dashboard/page.tsx`

### Key Features Implemented

#### 1. Multi-Source Selection
- Email (enabled by default)
- Calendar (disabled by default, placeholder endpoint)
- Drive (disabled by default, placeholder endpoint)
- Interactive toggle buttons with visual feedback
- Checkbox-style UI (☑ / ☐)

#### 2. Date Range Selection
- Last 7 days
- Last 30 days (default)
- Last 90 days
- All time
- Button group UI with active state highlighting

#### 3. State Management
```typescript
type DateRange = '7d' | '30d' | '90d' | 'all';

const [sources, setSources] = useState({
  email: true,
  calendar: false,
  drive: false,
});
const [dateRange, setDateRange] = useState<DateRange>('30d');
```

#### 4. Sync Logic
- Converts date range to days (7, 30, 90, or undefined for "all")
- Calls appropriate API endpoints based on selected sources:
  - Email: `POST /api/gmail/sync-user`
  - Calendar: `POST /api/calendar/sync` (placeholder)
  - Drive: `POST /api/drive/sync` (placeholder)
- Aggregates results and errors from multiple sources
- Displays combined status message

#### 5. UI Design
- Clean, modern Tailwind-inspired styling
- Consistent with existing dashboard design
- Responsive layout with flexbox
- Visual feedback on hover and selection
- Full-width sync button
- Centered status messages with color coding (green for success, red for errors)

## API Integration

### Email Sync
```typescript
POST /api/gmail/sync-user
Body: {
  maxResults: 100,
  folder: 'sent',
  days?: number  // 7, 30, 90, or undefined
}
```

### Calendar Sync (Placeholder)
```typescript
POST /api/calendar/sync
Body: {
  days?: number
}
```

### Drive Sync (Placeholder)
```typescript
POST /api/drive/sync
Body: {
  days?: number
}
```

## User Experience

1. User sees "Data Sync" section with clear title and description
2. User can toggle multiple sources (Email, Calendar, Drive)
3. User selects date range (7d, 30d, 90d, or all time)
4. User clicks "Start Sync" button
5. System:
   - Shows "Syncing..." state on button
   - Calls all selected source endpoints in parallel
   - Aggregates results
   - Shows success or error messages

## Visual Hierarchy

```
Data Sync
└─ Sync your data sources to extract entities

   Select Sources
   ├─ ☑ Email
   ├─ ☐ Calendar
   └─ ☐ Drive

   Date Range
   ├─ Last 7 days
   ├─ [Last 30 days] (selected)
   ├─ Last 90 days
   └─ All time

   [Start Sync]

   Status message (if any)
```

## Technical Details

- TypeScript strict mode compatible
- No external dependencies added
- Inline styles matching existing dashboard pattern
- Async/await for all API calls
- Proper error handling per source
- Disabled state handling during sync
- No console errors or warnings

## Future Enhancements

When Calendar and Drive endpoints are implemented:
1. Remove placeholder comments
2. Adjust error messages if needed
3. Consider adding progress indicators for long-running syncs
4. Add sync history/logs section
5. Add ability to schedule automatic syncs
