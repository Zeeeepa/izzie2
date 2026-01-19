# Extraction API Endpoints

All endpoints require authentication via `requireAuth()`.

## 1. GET /api/extraction/status

Returns extraction progress for all sources (email, calendar, drive) for the current user.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "progress": [
    {
      "id": "uuid",
      "userId": "user-id",
      "source": "email",
      "status": "running",
      "totalItems": 500,
      "processedItems": 250,
      "failedItems": 5,
      "entitiesExtracted": 1200,
      "progressPercentage": 50,
      "oldestDateExtracted": "2024-01-01T00:00:00.000Z",
      "newestDateExtracted": "2024-12-31T00:00:00.000Z",
      "currentChunkStart": "2024-06-01T00:00:00.000Z",
      "currentChunkEnd": "2024-06-07T00:00:00.000Z",
      "lastRunAt": "2024-01-07T14:30:00.000Z",
      "totalCost": 125,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-07T14:30:00.000Z"
    },
    // ... calendar, drive
  ]
}
```

## 2. POST /api/extraction/start

Start extraction for a specific source with date range.

**Authentication**: Required

**Request Body**:
```json
{
  "source": "email",  // Required: 'email' | 'calendar' | 'drive'
  "dateRange": "30d"  // Optional: '7d' | '30d' | '90d' | 'all' (default: '30d')
}
```

**Response**:
```json
{
  "success": true,
  "message": "Extraction started for email",
  "progress": {
    "id": "uuid",
    "userId": "user-id",
    "source": "email",
    "status": "running",
    "currentChunkStart": "2024-12-08T00:00:00.000Z",
    "currentChunkEnd": "2025-01-07T00:00:00.000Z",
    "lastRunAt": "2025-01-07T14:30:00.000Z",
    // ... other fields
  }
}
```

**Error Responses**:
- `400` - Invalid source or dateRange
- `409` - Extraction already running
- `401` - Authentication required

**Behavior**:
- Creates/updates progress record with status='running'
- Triggers actual sync in background (doesn't wait for completion)
- For email: calls `/api/gmail/sync` with sent folder focus
- For calendar: calls `/api/calendar/sync` with calculated date range
- For drive: Not yet implemented (returns 500 error)

## 3. POST /api/extraction/pause

Pause a running extraction.

**Authentication**: Required

**Request Body**:
```json
{
  "source": "email"  // Required: 'email' | 'calendar' | 'drive'
}
```

**Response**:
```json
{
  "success": true,
  "message": "Extraction paused for email",
  "progress": {
    "id": "uuid",
    "userId": "user-id",
    "source": "email",
    "status": "paused",
    // ... other fields
  }
}
```

**Error Responses**:
- `400` - Invalid source
- `409` - Extraction not running
- `401` - Authentication required

## 4. POST /api/extraction/reset

Reset extraction progress for a source. Clears all counters and sets status to 'idle'.

**Authentication**: Required

**Request Body**:
```json
{
  "source": "email",       // Required: 'email' | 'calendar' | 'drive'
  "clearEntities": false   // Optional: Also delete extracted entities (default: false)
}
```

**Response**:
```json
{
  "success": true,
  "message": "Extraction reset for email",
  "progress": {
    "id": "uuid",
    "userId": "user-id",
    "source": "email",
    "status": "idle",
    "totalItems": 0,
    "processedItems": 0,
    "failedItems": 0,
    "entitiesExtracted": 0,
    "totalCost": 0,
    "oldestDateExtracted": null,
    "newestDateExtracted": null,
    "currentChunkStart": null,
    "currentChunkEnd": null,
    // ... other fields
  },
  "entitiesCleared": 0  // Only present if clearEntities=true
}
```

**Error Responses**:
- `400` - Invalid source
- `401` - Authentication required

**Behavior**:
- Resets all progress counters to 0
- Sets status to 'idle'
- Clears date watermarks
- If `clearEntities=true`, deletes all extracted entities for that source

## Progress Status Values

- `idle` - No extraction in progress
- `running` - Extraction currently active
- `paused` - Extraction paused by user
- `completed` - Extraction finished successfully
- `error` - Extraction failed

## Integration Points

The `/api/extraction/start` endpoint triggers these sync endpoints:

- **Email**: `POST /api/gmail/sync`
  - Parameters: `{ folder: 'sent', maxResults: 500, since: ISO_DATE, userEmail: USER_ID }`
  
- **Calendar**: `POST /api/calendar/sync`
  - Parameters: `{ maxResults: 500, daysPast: NUMBER, daysFuture: 30, userEmail: USER_ID }`
  
- **Drive**: Not yet implemented

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description"
}
```

With appropriate HTTP status codes:
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized (missing/invalid auth)
- `409` - Conflict (invalid state transition)
- `500` - Internal server error

## Usage Examples

### Check extraction status
```bash
curl -X GET http://localhost:3300/api/extraction/status \
  -H "Cookie: izzie2.session_token=YOUR_TOKEN"
```

### Start email extraction (30 days)
```bash
curl -X POST http://localhost:3300/api/extraction/start \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2.session_token=YOUR_TOKEN" \
  -d '{"source": "email", "dateRange": "30d"}'
```

### Pause calendar extraction
```bash
curl -X POST http://localhost:3300/api/extraction/pause \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2.session_token=YOUR_TOKEN" \
  -d '{"source": "calendar"}'
```

### Reset email extraction and clear entities
```bash
curl -X POST http://localhost:3300/api/extraction/reset \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2.session_token=YOUR_TOKEN" \
  -d '{"source": "email", "clearEntities": true}'
```
