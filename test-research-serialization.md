# Research Agent Serialization Fix - Verification Plan

**Date:** 2026-02-09
**Changes Verified:**
1. Concurrency control: `limit: 1, key: 'event.data.userId'` (lines 39-42 in research-task.ts)
2. Step 0 initialization: "Initializing research agent" at 0% (lines 59-63 in research-agent.ts)
3. Initial feedback message in research tool (lines 95-99 in research.ts)

## Test Scenarios

### Scenario 1: Single Research Task (Baseline)

**Expected Behavior:**
- Task starts immediately
- Status progression: `pending` → `running` → `completed`
- Progress: 0% (initializing) → 10% (planning) → 15% (searching) → ... → 100%
- No "0% pending" state after task creation
- Telegram notification sent on completion

**Verification Points:**
1. Task record created in `agent_tasks` table
2. Initial progress update within 2 seconds: `currentStep: "Initializing research agent"`, `progress: 0`
3. Status transitions logged correctly
4. Final output contains research findings

**Database Query:**
```sql
SELECT
  id,
  status,
  progress,
  current_step,
  created_at,
  started_at,
  completed_at,
  updated_at
FROM agent_tasks
WHERE agent_type = 'research'
  AND user_id = '<test_user_id>'
ORDER BY created_at DESC
LIMIT 1;
```

---

### Scenario 2: Serial Execution (Critical Test)

**Expected Behavior:**
- Task #1 starts immediately, shows "initializing" at 0%
- Task #2 waits until Task #1 completes (concurrency limit enforced)
- Task #2 does NOT show "running" while Task #1 is active
- Both tasks complete successfully in sequence
- No overlapping execution timestamps

**Verification Points:**
1. **Timing verification:**
   - Task #1 `started_at` < Task #1 `completed_at`
   - Task #2 `started_at` > Task #1 `completed_at` (NO OVERLAP)

2. **Status verification:**
   - Only one task shows `status = 'running'` at any given time

3. **Concurrency key verification:**
   - Inngest dashboard shows concurrency limit applied
   - Queue shows Task #2 waiting for Task #1

**Database Query:**
```sql
SELECT
  id,
  status,
  progress,
  current_step,
  created_at,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
FROM agent_tasks
WHERE agent_type = 'research'
  AND user_id = '<test_user_id>'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at ASC;
```

**Expected Result:**
```
Task 1: created_at=10:00:00, started_at=10:00:00, completed_at=10:02:30 (150s)
Task 2: created_at=10:00:05, started_at=10:02:30, completed_at=10:05:00 (150s)
                                ^^^^^^^^^^^^^ Task 2 starts AFTER Task 1 completes
```

---

### Scenario 3: Status Progression Monitoring

**Expected Behavior:**
- No "0% pending" indefinitely (stuck state)
- Progress updates occur within 2 seconds of status change
- Sequential progress: 0% → 10% → 15% → 40% → 70% → 100%
- Status transitions: `pending` → `running` → `completed`

**Verification Points:**
1. Time between `created_at` and first `updated_at` < 2 seconds
2. `current_step` values progress through expected phases:
   - "Initializing research agent"
   - "Planning research"
   - "Searching 3 source(s): web, email, drive"
   - "Analyzing sources"
   - "Synthesizing findings"

3. No status regression (e.g., `running` → `pending`)

**Database Query:**
```sql
SELECT
  id,
  status,
  progress,
  current_step,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) as time_to_first_update_seconds
FROM agent_tasks
WHERE agent_type = 'research'
  AND user_id = '<test_user_id>'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

---

## Verification Commands

### 1. Check Inngest Configuration

```bash
# Verify concurrency configuration in code
grep -A 5 "concurrency:" src/lib/events/functions/research-task.ts
```

**Expected Output:**
```typescript
concurrency: {
  limit: 1, // Only one research task at a time
  key: 'event.data.userId', // Per-user serialization
},
```

### 2. Check Initialization Step

```bash
# Verify Step 0 initialization in research agent
grep -A 5 "Step 0: Initialize" src/agents/research/research-agent.ts
```

**Expected Output:**
```typescript
// Step 0: Initialize research (0% progress)
await context.updateProgress({
  progress: 0,
  currentStep: 'Initializing research agent',
});
```

### 3. Check Initial Feedback Message

```bash
# Verify initial feedback in research tool
grep -A 5 "onProgress?.({" src/lib/chat/tools/research.ts
```

**Expected Output:**
```typescript
onProgress?.({
  step: 'Initializing research agent...',
  progress: 0,
  status: 'starting',
});
```

---

## Manual Testing Procedure

### Setup

1. **Start development server:**
   ```bash
   pnpm dev
   ```

2. **Start Inngest dev server:**
   ```bash
   npx inngest-cli@latest dev
   ```

3. **Open Inngest dashboard:**
   - Navigate to http://localhost:8288
   - Monitor function runs in real-time

### Test 1: Single Task

1. **Trigger research via chat UI:**
   - Query: "Research the latest AI developments"
   - Sources: web, email, drive

2. **Observe in Inngest dashboard:**
   - Function `research-task` should appear immediately
   - Status: `Running`
   - Steps progress sequentially

3. **Check database:**
   ```sql
   SELECT id, status, progress, current_step
   FROM agent_tasks
   WHERE agent_type = 'research'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

4. **Verify Telegram notification** (if configured)

### Test 2: Serial Execution

1. **Trigger Task #1:**
   - Query: "Research topic A"
   - Note the timestamp

2. **Immediately trigger Task #2** (within 5 seconds):
   - Query: "Research topic B"
   - Note the timestamp

3. **Observe Inngest dashboard:**
   - Task #1 should show `Running`
   - Task #2 should show `Queued` or `Pending`
   - Task #2 should NOT start until Task #1 completes

4. **Check database for timing:**
   ```sql
   SELECT
     id,
     status,
     created_at,
     started_at,
     completed_at,
     EXTRACT(EPOCH FROM (started_at - created_at)) as queue_time_seconds
   FROM agent_tasks
   WHERE agent_type = 'research'
   ORDER BY created_at DESC
   LIMIT 2;
   ```

5. **Expected evidence of serialization:**
   - Task #2 `queue_time_seconds` > 60 (waited for Task #1)
   - Task #2 `started_at` > Task #1 `completed_at`

### Test 3: Progress Monitoring

1. **Trigger research task**

2. **Watch database in real-time:**
   ```bash
   watch -n 1 "psql $DATABASE_URL -c \"SELECT id, status, progress, current_step, updated_at FROM agent_tasks WHERE agent_type = 'research' ORDER BY created_at DESC LIMIT 1;\""
   ```

3. **Verify:**
   - First update shows 0% + "Initializing"
   - Progress increases monotonically
   - No long gaps between updates

---

## Expected Evidence of Success

### ✅ Concurrency Control Working

**Inngest Dashboard:**
- Function configuration shows `concurrency: { limit: 1, key: 'event.data.userId' }`
- When multiple tasks queued, only one shows "Running"
- Queue displays waiting tasks

**Database Evidence:**
```sql
-- No overlapping execution times
SELECT
  id,
  started_at,
  completed_at,
  LAG(completed_at) OVER (ORDER BY started_at) as prev_completed_at,
  started_at - LAG(completed_at) OVER (ORDER BY started_at) as gap
FROM agent_tasks
WHERE agent_type = 'research'
  AND user_id = '<test_user_id>'
ORDER BY started_at;
```

**Expected:** All `gap` values >= 0 (no negative gaps = no overlap)

### ✅ Initialization Step Working

**Database Evidence:**
```sql
-- First progress update should be initialization
SELECT
  id,
  progress,
  current_step,
  created_at,
  updated_at,
  updated_at - created_at as time_to_first_update
FROM agent_tasks
WHERE agent_type = 'research'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- `progress = 0`
- `current_step = 'Initializing research agent'`
- `time_to_first_update` < 2 seconds

### ✅ No "0% Pending" Indefinitely

**Database Query:**
```sql
-- Check for tasks stuck in pending
SELECT
  id,
  status,
  progress,
  current_step,
  created_at,
  NOW() - created_at as age
FROM agent_tasks
WHERE agent_type = 'research'
  AND status = 'pending'
  AND NOW() - created_at > INTERVAL '30 seconds';
```

**Expected:** Empty result (no stuck tasks)

---

## Failure Indicators

### ❌ Concurrency NOT Working

**Symptoms:**
- Multiple tasks show `status = 'running'` simultaneously
- Overlapping `started_at` and `completed_at` timestamps
- No evidence of queuing in Inngest dashboard

**Root Cause:**
- Concurrency configuration not applied
- Incorrect concurrency key

### ❌ Initialization NOT Working

**Symptoms:**
- First progress update shows 10% (planning) instead of 0%
- `current_step` never shows "Initializing"
- Large gap between `created_at` and first `updated_at`

**Root Cause:**
- Step 0 not executed
- Progress update call missing or failing

### ❌ Still Stuck at "0% Pending"

**Symptoms:**
- Task created but no progress updates
- Status remains `pending` for > 30 seconds
- No Inngest function execution

**Root Cause:**
- Event not sent to Inngest
- Function not registered correctly
- Error in function initialization

---

## Rollback Plan

If serialization causes issues:

1. **Revert concurrency limit:**
   ```typescript
   // In src/lib/events/functions/research-task.ts
   export const researchTask = inngest.createFunction(
     {
       id: 'research-task',
       name: 'Research Task Execution',
       retries: 2,
       // REMOVE concurrency block
     },
     ...
   );
   ```

2. **Redeploy:**
   ```bash
   pnpm build
   # Restart Inngest dev server
   ```

---

## Success Criteria

- ✅ Single task completes successfully with 0% → 100% progress
- ✅ Two concurrent tasks execute serially (no overlap)
- ✅ No tasks stuck at "0% pending" indefinitely
- ✅ Progress updates occur within 2 seconds
- ✅ Database timestamps confirm serial execution
- ✅ Inngest dashboard shows concurrency enforcement

## Next Steps After Verification

1. **Monitor production metrics** (if deployed)
2. **Update architecture documentation** with verification results
3. **Add automated tests** for serialization behavior
4. **Consider per-user rate limiting** if needed
