# Google Tasks Integration - Testing Guide

## Prerequisites

1. **Google OAuth Setup**
   - User must be authenticated with Google OAuth
   - OAuth scope `https://www.googleapis.com/auth/tasks.readonly` must be granted
   - User must have a valid refresh token in the database

2. **Environment Variables**
   ```bash
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   NEXT_PUBLIC_APP_URL=http://localhost:3300
   BETTER_AUTH_SECRET=your_secret
   DEFAULT_USER_ID=your_test_user_id  # Optional, for testing scripts
   ```

3. **Google Tasks Data**
   - User should have at least one task list in Google Tasks
   - Recommended: Create a few tasks with different properties:
     - Task with due date
     - Task with notes
     - Completed task
     - Task with subtasks (parent/child relationship)

## Testing Methods

### Method 1: API Endpoint Testing (Recommended)

#### 1. Start the Next.js Development Server
```bash
npm run dev
```

#### 2. Get a Valid Session Cookie
Navigate to `http://localhost:3300` and sign in with Google. Copy the session cookie from your browser's DevTools:
- Open DevTools → Application → Cookies
- Copy the value of `izzie2_session`

#### 3. Trigger Task Sync
```bash
# Start sync
curl -X POST http://localhost:3300/api/tasks/sync \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2_session=YOUR_SESSION_COOKIE" \
  -d '{
    "maxTasksPerList": 100,
    "showCompleted": true,
    "showHidden": false
  }'
```

**Expected Response**:
```json
{
  "message": "Task sync started",
  "status": {
    "isRunning": true,
    "tasksProcessed": 0,
    "eventsSent": 0,
    "lastSync": "2026-01-18T23:00:00.000Z"
  }
}
```

#### 4. Check Sync Status
```bash
curl http://localhost:3300/api/tasks/sync \
  -H "Cookie: izzie2_session=YOUR_SESSION_COOKIE"
```

**Expected Response (after sync completes)**:
```json
{
  "status": {
    "isRunning": false,
    "tasksProcessed": 15,
    "eventsSent": 15,
    "lastSync": "2026-01-18T23:05:30.000Z"
  }
}
```

### Method 2: Direct Script Testing

#### Run the Test Script
```bash
# Set your user ID
export DEFAULT_USER_ID="your-user-id-from-database"

# Run the test
npx tsx scripts/test-tasks-api.ts
```

**Expected Output**:
```
🧪 Testing Google Tasks API Integration

📋 Testing with user ID: user_abc123

1️⃣ Listing all task lists...
✅ Found 3 task lists
   1. My Tasks (task_list_123)
   2. Work Projects (task_list_456)
   3. Personal (task_list_789)

2️⃣ Fetching all tasks from all lists...
✅ Found 15 total tasks across all lists

📊 Tasks by list:
   - My Tasks: 5 task(s)
   - Work Projects: 7 task(s)
   - Personal: 3 task(s)

📝 Sample tasks:
   1. [Work Projects] Review PR #123
      Notes: High priority - merge before Friday
      Due: 1/24/2026
      Status: needsAction
   2. [My Tasks] Buy groceries
      Status: needsAction
   ...

✅ All tests passed!
```

### Method 3: Inngest Event Testing

#### 1. Ensure Inngest is Running
```bash
# Check Inngest dev server status
# Visit http://localhost:8288 (or your Inngest dashboard URL)
```

#### 2. Trigger Sync and Monitor Events
```bash
# Trigger sync via API (see Method 1)
curl -X POST http://localhost:3300/api/tasks/sync \
  -H "Cookie: izzie2_session=YOUR_SESSION_COOKIE"
```

#### 3. Monitor Inngest Dashboard
1. Open Inngest dashboard: `http://localhost:8288`
2. Look for events:
   - `izzie/ingestion.task.extracted` - One per task
   - `izzie/ingestion.entities.extracted` - One per task (after extraction)

#### 4. Check Event Payload
Click on an `izzie/ingestion.task.extracted` event to see:
```json
{
  "userId": "user@example.com",
  "taskId": "task_123",
  "title": "Review PR #123",
  "notes": "High priority - merge before Friday",
  "due": "2026-01-24T17:00:00Z",
  "status": "needsAction",
  "listId": "task_list_456",
  "listTitle": "Work Projects",
  "updated": "2026-01-18T10:30:00Z"
}
```

### Method 4: Database Verification

#### Check Stored Entities
```sql
-- Check memory_entries for task-extracted entities
SELECT
  id,
  user_id,
  summary,
  importance,
  metadata->>'taskId' as task_id,
  metadata->>'title' as task_title,
  metadata->>'entityCount' as entity_count,
  created_at
FROM memory_entries
WHERE metadata->>'source' = 'task_extraction'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected Results**:
```
id  | user_id | summary                                  | importance | task_id  | task_title      | entity_count | created_at
----|---------|------------------------------------------|------------|----------|-----------------|--------------|-------------------
1   | user_1  | Task: Review PR #123 (Work Projects)     | 8          | task_123 | Review PR #123  | 3            | 2026-01-18 23:05:00
2   | user_1  | Task: Buy groceries (Personal)           | 5          | task_456 | Buy groceries   | 0            | 2026-01-18 23:05:01
...
```

#### Check Entities Metadata
```sql
-- Check extracted entities from tasks
SELECT
  metadata->'entities' as entities,
  metadata->>'entityTypes' as entity_types,
  metadata->>'extractionModel' as model
FROM memory_entries
WHERE metadata->>'source' = 'task_extraction'
  AND metadata->>'taskId' = 'YOUR_TASK_ID';
```

#### Check OAuth Tokens
```sql
-- Verify user has tasks.readonly scope
SELECT
  user_id,
  provider_id,
  scope,
  access_token_expires_at,
  refresh_token IS NOT NULL as has_refresh_token
FROM accounts
WHERE provider_id = 'google'
  AND user_id = 'YOUR_USER_ID';
```

**Expected**:
- `scope` should include `https://www.googleapis.com/auth/tasks.readonly`
- `has_refresh_token` should be `true`
- `access_token_expires_at` should be in the future (or will auto-refresh)

## Troubleshooting

### Issue: "No Google account linked to this user"

**Cause**: User hasn't authenticated with Google OAuth or tokens are missing.

**Solution**:
1. Navigate to the app and sign in with Google
2. Ensure OAuth flow completes successfully
3. Check database for `accounts` record:
   ```sql
   SELECT * FROM accounts WHERE user_id = 'YOUR_USER_ID' AND provider_id = 'google';
   ```

### Issue: "Unauthorized - authentication required"

**Cause**: Invalid or missing session cookie.

**Solution**:
1. Sign in to the app
2. Get a fresh session cookie from browser DevTools
3. Use the cookie in API requests

### Issue: "insufficient authentication scopes"

**Cause**: User granted OAuth access before `tasks.readonly` scope was added.

**Solution**:
1. Sign out and sign in again with Google
2. Google will prompt for additional scopes
3. Grant permission for Google Tasks access
4. Verify scope in database:
   ```sql
   SELECT scope FROM accounts WHERE user_id = 'YOUR_USER_ID' AND provider_id = 'google';
   ```

### Issue: "No tasks found" but user has tasks in Google Tasks

**Possible Causes**:
1. All tasks are in hidden/deleted state
2. Task lists are empty
3. API quota exceeded (rare)

**Solution**:
1. Check sync options: `showCompleted: true`, `showHidden: true`
2. Verify tasks exist in Google Tasks web UI
3. Check Google Cloud Console quota dashboard

### Issue: Sync hangs or times out

**Cause**: Large number of tasks or slow network.

**Solution**:
1. Reduce `maxTasksPerList` to a smaller number (e.g., 50)
2. Check network connectivity
3. Review Next.js server logs for errors
4. Increase timeout in API route if needed

## Expected Behavior

### Successful Sync Flow

1. **User triggers sync** → POST `/api/tasks/sync`
2. **API validates auth** → Checks session, gets user ID
3. **Background sync starts** → Returns immediately with status
4. **Fetch task lists** → Calls Google Tasks API
5. **Fetch tasks from each list** → Paginated fetching
6. **Emit Inngest events** → One event per task
7. **Entity extraction** → Process each task
8. **Store entities** → Save to `memory_entries`
9. **Downstream events** → Trigger graph updates
10. **Sync complete** → Status updated

### Entity Extraction Results

For a task like:
```json
{
  "title": "Schedule meeting with @john and @sarah",
  "notes": "Discuss Q1 planning. Need to finalize by Friday.",
  "due": "2026-01-24T17:00:00Z",
  "status": "needsAction"
}
```

**Expected Extracted Entities**:
```json
[
  {
    "type": "action_item",
    "value": "Schedule meeting",
    "assignee": "@john, @sarah",
    "deadline": "2026-01-24T17:00:00Z",
    "priority": "medium",
    "confidence": 0.9
  },
  {
    "type": "person",
    "value": "@john",
    "normalized": "john",
    "confidence": 0.95
  },
  {
    "type": "person",
    "value": "@sarah",
    "normalized": "sarah",
    "confidence": 0.95
  },
  {
    "type": "topic",
    "value": "Q1 planning",
    "confidence": 0.85
  }
]
```

**Importance Score**: 7
- Base: 5
- Incomplete (needsAction): +2
- Due within 7 days: +3
- Mentions people: +1
- Total: 11 → Capped at 10

## Performance Benchmarks

### Expected Performance

- **Task Lists Fetch**: < 500ms for 10 lists
- **Tasks Fetch**: ~100ms per task list (50 tasks)
- **Entity Extraction**: ~2-5 seconds per task (depends on LLM)
- **Total Sync Time**: 1-3 minutes for 50 tasks

### Rate Limits

- **Google Tasks API**: 10,000 requests/day (project-level)
- **Inngest**: No practical limits on dev
- **LLM (Entity Extraction)**: Depends on provider (OpenAI, Anthropic, etc.)

## Logs to Monitor

### Next.js Server Logs
```
[Tasks] Found 3 task lists
[Tasks] Found 5 tasks in "My Tasks"
[Tasks] Found 7 tasks in "Work Projects"
[Tasks] Found 3 tasks in "Personal"
[Tasks] Total: 15 tasks across all lists
[Tasks Sync] Sent 15 events for entity extraction
[Tasks Sync] Completed. Processed 15 tasks, sent 15 events for extraction
```

### Inngest Function Logs
```
[IngestTasks] Processing task task_123
[IngestTasks] Extracted 3 entities from task task_123
[IngestTasks] Stored task task_123 in memory_entries
[IngestTasks] Emitted entities extracted event for task task_123
```

## Next Steps After Testing

1. ✅ Verify tasks are synced successfully
2. ✅ Check entities are extracted and stored
3. ✅ Test querying stored entities via memory API
4. ✅ Integrate with chat/assistant to query task-based entities
5. ✅ Set up periodic sync (cron job or scheduled Inngest function)
6. ✅ Monitor extraction costs and performance

## Related Documentation

- **Implementation Summary**: `/GOOGLE_TASKS_IMPLEMENTATION.md`
- **API Reference**: `/src/lib/google/tasks.ts`
- **Event Types**: `/src/lib/events/types.ts`
- **Entity Extraction**: `/src/lib/events/functions/ingest-tasks.ts`
