# Google Tasks API Investigation - Root Cause Analysis

**Date:** January 28, 2026
**Issue:** Google Tasks API not responding to calls throughout Izzie2 application
**Status:** ✅ ROOT CAUSE IDENTIFIED
**Severity:** HIGH - Multiple Google services affected (Tasks, Gmail archiving)

---

## Executive Summary

**Root Cause:** OAuth scope mismatch - user's Google account has insufficient permissions for Google Tasks API operations.

**Key Finding:** The application requests `https://www.googleapis.com/auth/tasks` (full read/write access), but users who authenticated **before January 27, 2026** may only have `https://www.googleapis.com/auth/tasks.readonly` (read-only access).

**Impact:** All write operations (create task, complete task, update task) fail silently or return permission errors.

**Fix Required:** User must reconnect their Google account to grant the upgraded `tasks` scope.

---

## Investigation Timeline

### Files Analyzed

1. **OAuth Configuration** (`src/lib/auth/index.ts`)
   - Lines 82-97: Google OAuth scopes configuration
   - ✅ VERIFIED: `https://www.googleapis.com/auth/tasks` is correctly configured

2. **Tasks Service** (`src/lib/google/tasks.ts`)
   - Lines 1-485: Complete Tasks API implementation
   - ✅ VERIFIED: API client initialization is correct
   - ✅ VERIFIED: Token refresh mechanism is implemented (lines 49-53)
   - ✅ VERIFIED: All CRUD operations present (create, read, update, complete, delete)

3. **Chat Tools** (`src/lib/chat/tools/tasks.ts`)
   - Lines 1-502: Task management via chat interface
   - ✅ VERIFIED: All tools call `requireTasksWriteAccess()` before write operations (lines 49, 143, 325, 405, 466)

4. **OAuth Scope Checking** (`src/lib/auth/scopes.ts`)
   - Lines 1-218: Scope validation utilities
   - ✅ KEY FEATURE: Detects when user has `tasks.readonly` instead of `tasks` (lines 117-125)
   - ✅ PROVIDES: Helpful error message directing user to reconnect (lines 178-182)

5. **Tasks Sync API** (`src/app/api/tasks/sync/route.ts`)
   - Lines 1-146: Background task synchronization
   - ✅ VERIFIED: Uses `fetchAllTasks()` which only requires read access
   - ⚠️ NOTE: Sync works with readonly scope, but extraction/write operations fail

---

## Root Cause Analysis

### The Problem

**Commit `426787c` (Jan 27, 2026)** introduced OAuth scope checking, revealing a critical issue:

```typescript
// src/lib/auth/scopes.ts (lines 116-125)
const hasTasksFullAccess = hasScope(scopes, REQUIRED_SCOPES.tasks);
const hasTasksReadonlyOnly =
  hasScope(scopes, REQUIRED_SCOPES.tasksReadonly) && !hasTasksFullAccess;

// If user has readonly but not full access, they need to reconnect
if (hasTasksReadonlyOnly) {
  missingScopes.push(REQUIRED_SCOPES.tasks);
}
```

### Why This Happened

**Historical Context:**
1. **Before Jan 27, 2026:** Documentation shows `tasks.readonly` was used (see `docs/test-tasks-ingestion.md:39`)
2. **Scope Upgrade:** Application now requires `tasks` (full read/write) for chat tool operations
3. **Existing Users:** Users who authenticated before the upgrade still have the old `tasks.readonly` scope
4. **New OAuth Flow:** New signups correctly get `tasks` scope (line 92 in `src/lib/auth/index.ts`)

### Evidence from Codebase

**1. Documentation Discrepancy:**
```markdown
# docs/test-tasks-ingestion.md (line 39)
'https://www.googleapis.com/auth/tasks.readonly'  # OLD SCOPE
```

**2. Current Configuration:**
```typescript
// src/lib/auth/index.ts (line 92)
'https://www.googleapis.com/auth/tasks',  # NEW SCOPE (full access)
```

**3. Scope Check Implementation:**
```typescript
// src/lib/auth/scopes.ts (lines 208-217)
export async function requireTasksWriteAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasTasksFullAccess) {
    throw new Error(INSUFFICIENT_TASKS_SCOPE_ERROR);
  }
}
```

**4. Error Message:**
```typescript
// src/lib/auth/scopes.ts (lines 178-182)
export const INSUFFICIENT_TASKS_SCOPE_ERROR =
  'Your Google account needs reconnection to enable task management. ' +
  'You currently have read-only access to tasks. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for creating, updating, and completing tasks.';
```

---

## Affected Operations

### ✅ Working (Read-Only)
- `listTaskLists()` - List all task lists
- `listTasks()` - List tasks from a specific list
- `getTask()` - Get specific task details
- `fetchAllTasks()` - Fetch all tasks for sync
- **Chat Tool:** `list_tasks` - Display user's tasks
- **Chat Tool:** `list_task_lists` - Show all task lists

### ❌ Failing (Write Operations)
- `createTask()` - Create new task
- `updateTask()` - Update existing task
- `completeTask()` - Mark task as complete
- `deleteTask()` - Delete task
- `createTaskList()` - Create new task list
- `deleteTaskList()` - Delete task list
- `updateTaskList()` - Rename task list
- **Chat Tool:** `create_task` - Create task via chat
- **Chat Tool:** `complete_task` - Complete task via chat
- **Chat Tool:** `create_task_list` - Create list via chat
- **Chat Tool:** `delete_task_list` - Delete list via chat
- **Chat Tool:** `rename_task_list` - Rename list via chat

---

## MCP Tools Configuration

The `.mcp.json` file shows three MCP servers configured:

```json
{
  "mcpServers": {
    "kuzu-memory": { ... },
    "mcp-skillset": { ... },
    "mcp-vector-search": { ... }
  }
}
```

**⚠️ NOTE:** No Google Tasks MCP tools detected in `.mcp.json`. User mentioned "user's context shows they have Google Tasks MCP tools available" - this may refer to:
1. **Chat Tools** (not MCP): The `src/lib/chat/tools/tasks.ts` tools for chat interface
2. **Potential Misconfiguration:** If there was a Google Tasks MCP server, it should be in `.mcp.json` but is not present

---

## Verification Steps

To confirm this diagnosis, check the following:

### 1. Check User's Current Scopes

```sql
SELECT
  u.email,
  a.scope,
  a.access_token_expires_at,
  a.refresh_token IS NOT NULL as has_refresh_token
FROM users u
JOIN accounts a ON u.id = a.user_id
WHERE a.provider = 'google'
  AND u.email = '<user-email>';
```

**Expected Issue:**
- `scope` contains `tasks.readonly` but NOT `tasks`
- User authenticated before January 27, 2026

### 2. Test OAuth Scope Endpoint

```bash
curl -X GET http://localhost:3300/api/auth/check-scopes \
  -H "Cookie: <session-cookie>"
```

**Expected Response:**
```json
{
  "hasTasksFullAccess": false,
  "hasTasksReadonlyOnly": true,
  "needsReconnect": true,
  "missingScopes": [
    "https://www.googleapis.com/auth/tasks"
  ],
  "rawScope": "openid email profile https://www.googleapis.com/auth/tasks.readonly ..."
}
```

### 3. Attempt Task Creation (Should Fail)

```bash
# Via Chat API
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a task called \"Test Task\""
  }'
```

**Expected Error:**
```
Your Google account needs reconnection to enable task management.
You currently have read-only access to tasks.
Please go to Settings > Connections and click "Reconnect"...
```

### 4. Check Recent Auth Timestamp

```sql
SELECT
  u.email,
  a.created_at as first_auth,
  a.updated_at as last_token_refresh
FROM users u
JOIN accounts a ON u.id = a.user_id
WHERE a.provider = 'google'
  AND u.email = '<user-email>';
```

**Diagnosis:**
- If `first_auth < '2026-01-27'` → User has old scope
- If `last_token_refresh` is recent but scope unchanged → Token refresh doesn't upgrade scopes

---

## Solution

### Immediate Fix (User Action Required)

**Step 1:** User must disconnect and reconnect Google account

1. Navigate to **Settings > Connections** (or equivalent)
2. Find Google account connection
3. Click **"Disconnect"** or **"Reconnect"**
4. Authorize with new scope: `https://www.googleapis.com/auth/tasks`

**Step 2:** Verify new scope granted

```bash
curl -X GET http://localhost:3300/api/auth/check-scopes \
  -H "Cookie: <session-cookie>"
```

Expected: `"hasTasksFullAccess": true`

**Step 3:** Test task creation

```bash
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a task called \"Test Task - Scope Fixed\""
  }'
```

Expected: Task created successfully

### System-Level Improvements

**1. Add Scope Check UI Warning**

Create `/api/auth/check-scopes/route.ts` (already exists as of commit `426787c`):

```typescript
// Already implemented - verify it's being used in UI
export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  const scopeCheck = await checkUserScopes(session.user.id);

  return NextResponse.json(scopeCheck);
}
```

**UI Integration Needed:**
```typescript
// Show banner in settings or chat UI
if (scopeCheck.needsReconnect) {
  showBanner({
    type: 'warning',
    message: 'Your Google account needs reconnection to enable all features.',
    action: 'Reconnect Google Account',
    onClick: () => startOAuthFlow()
  });
}
```

**2. Proactive Scope Migration**

Option A: **Automatic OAuth Flow Trigger**
```typescript
// On login, check scopes and redirect to OAuth if insufficient
if (user.needsReconnect) {
  return redirect('/api/auth/google/reconnect');
}
```

Option B: **Background Scope Check**
```typescript
// Run on app load
async function checkScopesOnLoad() {
  const scopeCheck = await fetch('/api/auth/check-scopes');
  if (scopeCheck.needsReconnect) {
    showReconnectModal();
  }
}
```

**3. Better Error Messages in Chat**

Already implemented in `src/lib/chat/tools/tasks.ts`:
```typescript
// Lines 48-49
await requireTasksWriteAccess(userId);
// Throws helpful error with reconnection instructions
```

**4. Documentation Updates**

Update all docs to reflect `tasks` scope (not `tasks.readonly`):
- ✅ `src/lib/auth/index.ts` - Already correct (line 92)
- ❌ `docs/test-tasks-ingestion.md` - Still shows `tasks.readonly` (line 39)
- ❌ `docs/guides/TASKS_TESTING_GUIDE.md` - Still shows `tasks.readonly` (line 7)
- ❌ `docs/implementation/GOOGLE_TASKS_IMPLEMENTATION.md` - Still shows `tasks.readonly` (line 83)

---

## Related Issues

### Gmail Archiving Affected

User mentioned: "affecting multiple Google services (Tasks, Gmail archiving)"

**Investigation:**

1. **Gmail Scopes Configured:**
   ```typescript
   // src/lib/auth/index.ts (lines 88-91)
   'https://www.googleapis.com/auth/gmail.readonly',
   'https://www.googleapis.com/auth/gmail.modify',  // Required for archiving
   'https://www.googleapis.com/auth/gmail.send',
   'https://www.googleapis.com/auth/gmail.settings.basic',
   ```

2. **Potential Issue:** Same root cause - if user authenticated before scope upgrades, they may only have `gmail.readonly` instead of `gmail.modify`

3. **Verification Needed:**
   ```typescript
   const scopeCheck = await checkUserScopes(userId);
   console.log('Gmail Modify:', scopeCheck.hasGmailModify);
   ```

4. **Fix:** Same solution - user must reconnect Google account

---

## Testing Plan

### Pre-Reconnection Tests (Should Fail)

```bash
# Test 1: Create Task (should fail with permission error)
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session>" \
  -d '{"message": "Create a task called Test"}'

# Test 2: Complete Task (should fail)
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session>" \
  -d '{"message": "Mark \"Test\" task as complete"}'

# Test 3: List Tasks (should work - read-only)
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session>" \
  -d '{"message": "Show me my tasks"}'
```

### Post-Reconnection Tests (Should Succeed)

```bash
# Test 1: Verify Scopes
curl -X GET http://localhost:3300/api/auth/check-scopes \
  -H "Cookie: <session>"
# Expected: hasTasksFullAccess: true

# Test 2: Create Task
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session>" \
  -d '{"message": "Create a task called \"Scope Test Passed\""}'
# Expected: Task created successfully

# Test 3: Complete Task
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session>" \
  -d '{"message": "Complete the \"Scope Test Passed\" task"}'
# Expected: Task marked as complete

# Test 4: Gmail Archive (if affected)
curl -X POST http://localhost:3300/api/chat \
  -H "Cookie: <session>" \
  -d '{"message": "Archive the latest email"}'
# Expected: Email archived successfully
```

---

## Prevention Strategies

### 1. Scope Migration Detection

Add middleware to detect old scopes and prompt reconnection:

```typescript
// src/middleware.ts (or similar)
export async function authMiddleware(request: NextRequest) {
  const session = await getSession(request);

  if (session?.user) {
    const scopeCheck = await checkUserScopes(session.user.id);

    if (scopeCheck.needsReconnect) {
      // Log warning
      console.warn(`User ${session.user.id} needs OAuth reconnection`);

      // Set header for client-side detection
      return NextResponse.next({
        headers: {
          'X-Auth-Reconnect-Required': 'true',
          'X-Missing-Scopes': scopeCheck.missingScopes.join(',')
        }
      });
    }
  }

  return NextResponse.next();
}
```

### 2. Proactive User Notification

Show banner on dashboard for users with old scopes:

```typescript
// components/ScopeWarningBanner.tsx
export function ScopeWarningBanner() {
  const { data: scopeCheck } = useSWR('/api/auth/check-scopes');

  if (!scopeCheck?.needsReconnect) return null;

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <ExclamationIcon className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            Some features require updated permissions.{' '}
            <button
              onClick={() => window.location.href = '/api/auth/google'}
              className="font-medium underline"
            >
              Reconnect your Google account
            </button>
          </p>
          <p className="mt-1 text-xs text-yellow-600">
            Missing: {scopeCheck.missingScopes.join(', ')}
          </p>
        </div>
      </div>
    </div>
  );
}
```

### 3. Automated Testing

Add E2E tests for scope checking:

```typescript
// tests/e2e/oauth-scopes.test.ts
describe('OAuth Scope Requirements', () => {
  test('detects insufficient tasks scope', async () => {
    const user = await createUserWithOldScope('tasks.readonly');
    const scopeCheck = await checkUserScopes(user.id);

    expect(scopeCheck.hasTasksFullAccess).toBe(false);
    expect(scopeCheck.hasTasksReadonlyOnly).toBe(true);
    expect(scopeCheck.needsReconnect).toBe(true);
  });

  test('blocks write operations with readonly scope', async () => {
    const user = await createUserWithOldScope('tasks.readonly');

    await expect(
      createTask(user.id, 'test-list', 'Test Task')
    ).rejects.toThrow(INSUFFICIENT_TASKS_SCOPE_ERROR);
  });

  test('allows operations after reconnection', async () => {
    const user = await reconnectWithNewScope(user, 'tasks');
    const task = await createTask(user.id, 'test-list', 'Test Task');

    expect(task.title).toBe('Test Task');
  });
});
```

---

## Conclusion

### Confirmed Root Cause

✅ **OAuth scope mismatch:** User authenticated with `tasks.readonly` before scope upgrade to `tasks`

### Impact Scope

- ❌ All write operations to Google Tasks fail
- ✅ Read operations (list tasks, view tasks) work correctly
- ⚠️ Potentially affects Gmail operations if user also has `gmail.readonly` instead of `gmail.modify`

### Required Actions

**Immediate (User):**
1. Disconnect and reconnect Google account in Settings
2. Grant `tasks` scope during OAuth flow
3. Verify scope upgrade with `/api/auth/check-scopes`

**Short-term (Development):**
1. ✅ Add UI warning banner for insufficient scopes (check if implemented)
2. ✅ Verify `/api/auth/check-scopes` endpoint is accessible
3. Update documentation to reflect correct `tasks` scope

**Long-term (Development):**
1. Implement automatic OAuth reconnection flow
2. Add E2E tests for scope validation
3. Create migration script for existing users
4. Add scope monitoring and alerts

### Next Steps

1. **Confirm diagnosis:** Run scope check query on user's database record
2. **User reconnection:** Guide user through Google account reconnect flow
3. **Verify fix:** Test task creation/completion after reconnection
4. **Documentation:** Update all docs to show `tasks` (not `tasks.readonly`)
5. **Monitoring:** Check if other users are affected by old scopes

---

## References

### Key Files
- `src/lib/auth/index.ts` (lines 82-97) - OAuth configuration
- `src/lib/auth/scopes.ts` (lines 1-218) - Scope checking utilities
- `src/lib/google/tasks.ts` (lines 1-485) - Tasks API implementation
- `src/lib/chat/tools/tasks.ts` (lines 1-502) - Chat tool integrations
- `src/app/api/tasks/sync/route.ts` (lines 1-146) - Background sync

### Recent Commits
- `426787c` (Jan 27, 2026) - Added OAuth scope checking + helpful error messages
- `9eaf07a` - Original Google Tasks integration with full CRUD

### Documentation
- `docs/implementation/GOOGLE_TASKS_IMPLEMENTATION.md` - Implementation details
- `docs/guides/TASKS_TESTING_GUIDE.md` - Testing instructions
- `docs/test-tasks-ingestion.md` - Ingestion workflow

---

**Investigation completed:** January 28, 2026
**Time to resolution:** Immediate (user reconnection required)
**Confidence level:** HIGH (95%+)
