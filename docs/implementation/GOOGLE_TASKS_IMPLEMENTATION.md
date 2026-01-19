# Google Tasks Integration - Implementation Summary

## Overview

Successfully implemented Google Tasks sync support for Izzie. Tasks are now automatically synced, entities are extracted, and pending tasks appear in chat context to help Izzie proactively remind users about their to-do items.

## Implementation Details

### 1. Google Tasks Service (`/src/lib/google/tasks.ts`)

Created a comprehensive Tasks API service that:
- Uses Better Auth OAuth2 tokens (with automatic refresh)
- Provides methods to list task lists, list tasks, get specific tasks
- Includes `fetchAllTasks()` helper to retrieve all tasks across all lists
- Maps Google Tasks API responses to clean TypeScript types

**Key Functions:**
- `listTaskLists()` - Get all task lists for a user
- `listTasks()` - Get tasks from a specific list with filtering options
- `fetchAllTasks()` - Fetch all tasks from all lists (used by sync)

### 2. Tasks Sync API (`/src/app/api/tasks/sync/route.ts`)

**Updated** the existing sync endpoint to:
- Use Better Auth (`requireAuth`) instead of deprecated next-auth
- Call the new `fetchAllTasks()` service function
- Send tasks to Inngest for entity extraction via `izzie/ingestion.task.extracted` events
- Track sync status (running, tasks processed, events sent)

**Endpoints:**
- `POST /api/tasks/sync` - Start task synchronization
  - Query params: `maxTasksPerList`, `showCompleted`, `showHidden`
  - Returns: Sync status (isRunning, tasksProcessed, eventsSent)
- `GET /api/tasks/sync` - Get current sync status

### 3. Chat Context Integration

**Enhanced chat context** to include pending tasks:

#### Context Retrieval (`/src/lib/chat/context-retrieval.ts`)
- Added `retrievePendingTasks()` function that queries memory_entries for tasks with:
  - `source='task_extraction'`
  - `status='needsAction'`
  - Ordered by importance and creation date
- Integrated pending tasks into `retrieveContext()` alongside entities, memories, and calendar events
- Added `determinePriority()` helper to calculate task priority based on:
  - Due date (overdue, due today, due within 7 days)
  - Importance score

#### Context Formatter (`/src/lib/chat/context-formatter.ts`)
- Added `formatPendingTasks()` function that displays tasks grouped by priority:
  - 🔴 High priority (overdue or due within 3 days)
  - 🟡 Medium priority (due within 7 days)
  - Low priority (all others, limited to 3 for brevity)
- Includes due date context ("OVERDUE by 2 days", "Due TODAY", "Due in 5 days")
- Shows task list name in brackets `[Work Tasks]`
- Updated system prompt to instruct Izzie to proactively remind about high-priority tasks

### 4. Type Definitions (`/src/lib/google/types.ts`)

Added Google Tasks types:
```typescript
interface TaskList {
  id: string;
  title: string;
  updated?: string;
  selfLink?: string;
}

interface Task {
  id: string;
  title: string;
  updated: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC 3339 timestamp
  notes?: string;
  // ... other fields
}
```

### 5. OAuth Scopes

**Verified** that `https://www.googleapis.com/auth/tasks.readonly` is already included in the Better Auth configuration (`/src/lib/auth/index.ts`).

## Data Flow

```
1. User triggers sync: POST /api/tasks/sync
   ↓
2. Sync API fetches tasks from Google Tasks API
   ↓
3. Emits Inngest events: izzie/ingestion.task.extracted
   ↓
4. Inngest function (ingest-tasks.ts) extracts entities
   ↓
5. Stores in memory_entries with metadata.source='task_extraction'
   ↓
6. Chat context retrieves pending tasks (status='needsAction')
   ↓
7. Formatted and included in chat system prompt
   ↓
8. Izzie can now reference user's pending tasks in conversations
```

## Entity Extraction

Tasks are processed by the existing Inngest function (`/src/lib/events/functions/ingest-tasks.ts`) which:
- Extracts entities (people, companies, projects, dates, action items) from task title and notes
- Calculates importance score based on:
  - Task status (needsAction = higher priority)
  - Due date (overdue, due soon = higher priority)
  - Presence of action items
  - Collaboration (mentions of people)
- Stores in persistence layer with full metadata

## Chat Context Example

When a user asks Izzie a question, the system prompt now includes:

```
### Pending Tasks (5 total)
  - 🔴 Submit quarterly report (OVERDUE by 2 days) [Work Tasks]
  - 🔴 Review PR #123 (Due TODAY) [Development]
  - 🟡 Call dentist (Due Dec 15) [Personal]
  - Grocery shopping [Personal]
  - Read research paper [Learning]
```

Izzie can now:
- Proactively remind about overdue tasks
- Help prioritize work based on due dates
- Reference tasks when answering scheduling questions
- Suggest task completion when relevant

## Testing Instructions

### 1. Setup
Ensure you have:
- Google Tasks API enabled in Google Cloud Console
- OAuth consent screen configured with `tasks.readonly` scope
- Valid Google account with tasks created

### 2. Test Sync
```bash
# Start sync
curl -X POST http://localhost:3300/api/tasks/sync \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"maxTasksPerList": 100, "showCompleted": true}'

# Check sync status
curl http://localhost:3300/api/tasks/sync
```

### 3. Verify Data
```bash
# Check that tasks were stored in memory_entries
npm run db:studio

# Query for tasks
SELECT id, summary, metadata->>'source', metadata->>'status', metadata->>'title'
FROM memory_entries
WHERE metadata->>'source' = 'task_extraction'
AND metadata->>'status' = 'needsAction';
```

### 4. Test Chat Context
```bash
# Send a chat message
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"message": "What do I need to do today?"}'
```

Expected: Izzie should reference your pending tasks in the response.

## Files Created/Modified

### Created
- `/src/lib/google/tasks.ts` - Google Tasks service (245 lines)

### Modified
- `/src/app/api/tasks/sync/route.ts` - Updated to use Better Auth and new service (146 lines, -88 removed)
- `/src/lib/google/types.ts` - Added Task and TaskList types (+41 lines)
- `/src/lib/chat/context-retrieval.ts` - Added pending tasks retrieval (+82 lines)
- `/src/lib/chat/context-formatter.ts` - Added pending tasks formatting (+86 lines)
- `/src/lib/auth/index.ts` - Already had tasks.readonly scope (no change needed)

## Future Enhancements

1. **Task Completion**: Add API endpoint to mark tasks as complete from chat
2. **Task Creation**: Allow Izzie to create new tasks based on conversation
3. **Smart Reminders**: Proactive notifications for overdue/upcoming tasks
4. **Task Prioritization**: ML-based task priority suggestions
5. **Cross-referencing**: Link tasks to calendar events and emails
6. **Recurring Tasks**: Handle recurring task patterns

## LOC Delta

**Net Change: +454 lines**

- Added: 454 lines (new service, context retrieval, formatting)
- Removed: 88 lines (old sync implementation)
- Modified: ~150 lines (sync API refactor, context integration)

## Phase: MVP Complete ✅

This implementation delivers:
- ✅ Google Tasks API integration
- ✅ Automated task sync
- ✅ Entity extraction from tasks
- ✅ Pending tasks in chat context
- ✅ Priority-based task display
- ✅ OAuth scope verification

The implementation follows existing patterns (calendar sync, Better Auth, Inngest processing) and integrates seamlessly with the current codebase.
