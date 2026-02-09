# Quick Test Guide - Research Serialization

**30-Second Overview:** Verify that research tasks run one at a time per user, with immediate "Initializing" feedback.

---

## Quick Start

```bash
# 1. Start servers
pnpm dev                           # Terminal 1
npx inngest-cli@latest dev         # Terminal 2

# 2. Run static verification
./scripts/verify-research-serialization.sh

# 3. Open dashboards
# - Next.js: http://localhost:3000
# - Inngest: http://localhost:8288
```

---

## Test 1: Single Task (2 minutes)

**Goal:** Verify task completes successfully with progress updates

1. **Trigger:** Chat UI → "Research AI developments"
2. **Watch:** Inngest dashboard shows task running
3. **Verify:**
   ```sql
   -- Should show progress increasing
   SELECT id, status, progress, current_step
   FROM agent_tasks
   WHERE agent_type = 'research'
   ORDER BY created_at DESC LIMIT 1;
   ```
4. **Expected:** Status goes pending → running → completed in ~90s

**✅ Pass Criteria:**
- Initial progress = 0% with "Initializing" message
- Progress increases to 100%
- Telegram notification received

---

## Test 2: Serial Execution (5 minutes)

**Goal:** Verify Task #2 waits for Task #1 to complete

1. **Trigger Task #1:** "Research topic A"
2. **Trigger Task #2 immediately:** "Research topic B" (within 5 seconds)
3. **Watch Inngest dashboard:**
   - Task #1 should show "Running"
   - Task #2 should show "Queued"
4. **Verify serialization:**
   ```sql
   -- Check for overlap (should be EMPTY)
   SELECT
     a.id as task1,
     b.id as task2,
     a.started_at as task1_start,
     a.completed_at as task1_end,
     b.started_at as task2_start
   FROM agent_tasks a
   JOIN agent_tasks b ON a.user_id = b.user_id AND a.id != b.id
   WHERE b.started_at BETWEEN a.started_at AND a.completed_at
     AND a.agent_type = 'research'
     AND b.agent_type = 'research'
   ORDER BY a.started_at DESC
   LIMIT 1;
   ```

**✅ Pass Criteria:**
- Task #2 does NOT start until Task #1 completes
- Query returns 0 rows (no overlap)
- Task #2 starts within 5 seconds of Task #1 completion

---

## Test 3: Progress Monitoring (Real-time)

**Goal:** Verify progress updates occur regularly

1. **Trigger:** "Research quantum computing"
2. **Watch in real-time:**
   ```bash
   watch -n 1 "psql $DATABASE_URL -c \"SELECT id, status, progress, current_step, updated_at FROM agent_tasks WHERE agent_type = 'research' ORDER BY created_at DESC LIMIT 1;\""
   ```
3. **Expected:**
   - First update: 0% + "Initializing" (within 2 seconds)
   - Progress: 0% → 10% → 15% → 40% → 70% → 100%
   - Updates every 5-10 seconds

**✅ Pass Criteria:**
- No stuck at 0% for > 5 seconds
- Progress increases monotonically
- No gaps > 15 seconds between updates

---

## Quick Checks (30 seconds each)

### Check 1: Recent Tasks
```sql
SELECT id, status, progress, current_step, created_at
FROM agent_tasks
WHERE agent_type = 'research'
ORDER BY created_at DESC
LIMIT 5;
```
**Expected:** Recent tasks show completed status

### Check 2: No Stuck Tasks
```sql
SELECT id, status, NOW() - created_at as age
FROM agent_tasks
WHERE agent_type = 'research'
  AND status = 'pending'
  AND NOW() - created_at > INTERVAL '30 seconds';
```
**Expected:** 0 rows

### Check 3: No Overlaps
```sql
SELECT
  id,
  started_at,
  completed_at,
  LAG(completed_at) OVER (ORDER BY started_at) as prev_ended,
  started_at - LAG(completed_at) OVER (ORDER BY started_at) as gap
FROM agent_tasks
WHERE agent_type = 'research'
  AND status IN ('completed', 'failed')
ORDER BY started_at DESC
LIMIT 5;
```
**Expected:** All gaps >= 0 (no negative values)

---

## Common Issues & Fixes

### Issue: Task stuck at "0% pending"

**Check:**
```bash
# Is Inngest running?
curl http://localhost:8288/health

# Are events being sent?
grep "izzie/research.request" logs/inngest.log
```

**Fix:**
1. Restart Inngest dev server
2. Verify event payload in src/lib/chat/tools/research.ts
3. Check Inngest dashboard for errors

### Issue: Tasks running simultaneously

**Check:**
```typescript
// Verify concurrency config
grep -A 3 "concurrency:" src/lib/events/functions/research-task.ts
```

**Fix:**
1. Ensure concurrency block exists (lines 39-42)
2. Restart Inngest dev server
3. Clear Inngest cache: `rm -rf .inngest`

### Issue: No initialization message

**Check:**
```typescript
// Verify Step 0 exists
grep -A 5 "Step 0: Initialize" src/agents/research/research-agent.ts
```

**Fix:**
1. Verify context.updateProgress() is called at line 60
2. Check database for initial update
3. Add console.log to verify execution

---

## Success Indicators

✅ **Working Correctly:**
- Immediate "Initializing" feedback (< 2s)
- Progress updates every 5-10 seconds
- Tasks complete in 60-180 seconds
- Only one task "running" at a time
- Database shows no overlapping timestamps

❌ **NOT Working:**
- Stuck at 0% for > 5 seconds
- Multiple tasks "running" simultaneously
- Negative gaps in Query 3 (overlap)
- No progress updates for > 30 seconds

---

## Full Test Run (10 minutes)

```bash
# 1. Static verification
./scripts/verify-research-serialization.sh

# 2. Start monitoring
watch -n 2 "psql $DATABASE_URL -c 'SELECT id, status, progress, current_step FROM agent_tasks WHERE agent_type = '\''research'\'' ORDER BY created_at DESC LIMIT 3;'"

# 3. Run Test 1 (single task)
# → Trigger research via chat

# 4. Wait for completion (~90s)

# 5. Run Test 2 (serial execution)
# → Trigger two tasks back-to-back

# 6. Verify results
psql $DATABASE_URL -f scripts/verify-research-db.sql > test-results.txt

# 7. Review
cat test-results.txt | grep -A 5 "Query 2" # Check for overlaps
cat test-results.txt | grep -A 5 "Query 3" # Check initialization
cat test-results.txt | grep -A 5 "Query 4" # Check stuck tasks
```

---

## Report Results

**Pass:** All 3 tests pass, queries show expected results
**Fail:** Any test fails or queries show issues

**Document:**
1. Screenshots of Inngest dashboard
2. Database query results
3. Timestamp evidence of serialization
4. Any errors encountered

**File location:** `test-results-YYYY-MM-DD.md`

---

## Questions?

- **Full details:** `VERIFICATION-RESULTS.md`
- **Test scenarios:** `test-research-serialization.md`
- **Database queries:** `scripts/verify-research-db.sql`
- **Architecture:** `docs/research/research-agent-architecture-2026-02-09.md`
