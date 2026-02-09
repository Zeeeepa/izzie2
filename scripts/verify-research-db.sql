-- Research Agent Serialization - Database Verification Queries
-- Run these queries to verify serialization behavior

-- =============================================================================
-- Query 1: Check recent research tasks (last 10)
-- =============================================================================
-- Purpose: Overview of recent task execution
-- Expected: See task progression, timing, and completion status

SELECT
  id,
  status,
  progress,
  current_step,
  created_at,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at))::integer AS duration_seconds,
  EXTRACT(EPOCH FROM (started_at - created_at))::integer AS queue_time_seconds
FROM agent_tasks
WHERE agent_type = 'research'
ORDER BY created_at DESC
LIMIT 10;

-- Expected output:
-- - Tasks show progression from pending → running → completed
-- - Duration varies by query complexity (typically 30-180 seconds)
-- - Queue time shows how long task waited before execution

-- =============================================================================
-- Query 2: Verify serial execution (NO OVERLAP)
-- =============================================================================
-- Purpose: Confirm that no two tasks ran simultaneously
-- Expected: All gap values >= 0 (positive or zero)

SELECT
  id,
  user_id,
  started_at,
  completed_at,
  LAG(completed_at) OVER (PARTITION BY user_id ORDER BY started_at) AS prev_completed_at,
  EXTRACT(EPOCH FROM (
    started_at - LAG(completed_at) OVER (PARTITION BY user_id ORDER BY started_at)
  ))::integer AS gap_seconds
FROM agent_tasks
WHERE agent_type = 'research'
  AND status IN ('completed', 'failed')
  AND started_at IS NOT NULL
  AND completed_at IS NOT NULL
ORDER BY user_id, started_at;

-- Expected output:
-- - gap_seconds should be >= 0 for all rows (no negative gaps)
-- - Negative gap = OVERLAP (serialization FAILED)
-- - Positive gap = Task waited for previous task (serialization WORKING)

-- =============================================================================
-- Query 3: Check initialization step (Step 0 at 0% progress)
-- =============================================================================
-- Purpose: Verify that all tasks start with "Initializing" step
-- Expected: All tasks have first update at 0% with initialization message

WITH first_updates AS (
  SELECT
    id,
    progress,
    current_step,
    created_at,
    updated_at,
    EXTRACT(EPOCH FROM (updated_at - created_at))::numeric(5,2) AS time_to_first_update_seconds,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at) AS update_rank
  FROM agent_tasks
  WHERE agent_type = 'research'
    AND created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  id,
  progress,
  current_step,
  time_to_first_update_seconds
FROM first_updates
WHERE update_rank = 1
ORDER BY created_at DESC
LIMIT 10;

-- Expected output:
-- - progress = 0
-- - current_step LIKE 'Initializing%'
-- - time_to_first_update_seconds < 5 (ideally < 2)

-- =============================================================================
-- Query 4: Check for stuck tasks (pending > 30 seconds)
-- =============================================================================
-- Purpose: Identify tasks that never started executing
-- Expected: Empty result (no stuck tasks)

SELECT
  id,
  status,
  progress,
  current_step,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))::integer AS age_seconds
FROM agent_tasks
WHERE agent_type = 'research'
  AND status = 'pending'
  AND NOW() - created_at > INTERVAL '30 seconds'
ORDER BY created_at DESC;

-- Expected output: No rows
-- If rows exist: Tasks are stuck (serialization may be blocking incorrectly)

-- =============================================================================
-- Query 5: Analyze task status distribution
-- =============================================================================
-- Purpose: Overview of task outcomes
-- Expected: Most tasks completed, few failed, minimal pending

SELECT
  status,
  COUNT(*) AS count,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 1) AS avg_duration_seconds,
  ROUND(AVG(progress), 1) AS avg_final_progress
FROM agent_tasks
WHERE agent_type = 'research'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;

-- Expected output:
-- - completed: High count, avg_duration ~60-120s, avg_progress 100
-- - failed: Low count (< 5%), avg_progress varies
-- - pending: Very low count (only active tasks)
-- - running: 0 or 1 (current active task)

-- =============================================================================
-- Query 6: Check progress update frequency
-- =============================================================================
-- Purpose: Verify progress updates occur regularly (not stuck)
-- Expected: Updates every few seconds during execution

WITH task_updates AS (
  SELECT
    id,
    created_at,
    updated_at,
    LAG(updated_at) OVER (PARTITION BY id ORDER BY updated_at) AS prev_updated_at
  FROM agent_tasks
  WHERE agent_type = 'research'
    AND created_at > NOW() - INTERVAL '1 hour'
)
SELECT
  id,
  EXTRACT(EPOCH FROM (updated_at - prev_updated_at))::numeric(5,2) AS seconds_since_last_update,
  updated_at
FROM task_updates
WHERE prev_updated_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (updated_at - prev_updated_at)) > 10
ORDER BY seconds_since_last_update DESC
LIMIT 20;

-- Expected output:
-- - Most gaps < 5 seconds (frequent updates)
-- - Large gaps (> 30s) may indicate network delays or processing bottlenecks
-- - Empty result is ideal (all updates within 10s)

-- =============================================================================
-- Query 7: Verify concurrency enforcement (per-user)
-- =============================================================================
-- Purpose: Confirm only one task runs per user at a time
-- Expected: No overlapping tasks for same user

WITH overlapping_tasks AS (
  SELECT
    a.id AS task_a_id,
    a.user_id,
    a.started_at AS task_a_start,
    a.completed_at AS task_a_end,
    b.id AS task_b_id,
    b.started_at AS task_b_start,
    b.completed_at AS task_b_end
  FROM agent_tasks a
  JOIN agent_tasks b
    ON a.user_id = b.user_id
    AND a.id != b.id
    AND a.agent_type = 'research'
    AND b.agent_type = 'research'
  WHERE
    -- Task B started before Task A finished (OVERLAP)
    b.started_at < a.completed_at
    AND b.started_at > a.started_at
)
SELECT
  user_id,
  task_a_id,
  task_a_start,
  task_a_end,
  task_b_id,
  task_b_start,
  task_b_end,
  EXTRACT(EPOCH FROM (task_a_end - task_b_start))::integer AS overlap_seconds
FROM overlapping_tasks
ORDER BY task_a_start DESC;

-- Expected output: No rows (no overlapping tasks)
-- If rows exist: Concurrency control is NOT working

-- =============================================================================
-- Query 8: Task execution timeline (visual)
-- =============================================================================
-- Purpose: Visual representation of task execution sequence
-- Expected: See clear separation between tasks

SELECT
  id,
  user_id,
  TO_CHAR(started_at, 'HH24:MI:SS') AS start_time,
  TO_CHAR(completed_at, 'HH24:MI:SS') AS end_time,
  EXTRACT(EPOCH FROM (completed_at - started_at))::integer AS duration_sec,
  CASE
    WHEN status = 'completed' THEN '✓'
    WHEN status = 'failed' THEN '✗'
    WHEN status = 'running' THEN '▶'
    ELSE '○'
  END AS status_icon,
  current_step
FROM agent_tasks
WHERE agent_type = 'research'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY started_at DESC
LIMIT 20;

-- Expected output:
-- - Tasks show sequential start times (no overlap)
-- - Duration varies by complexity
-- - Status icons show completion state

-- =============================================================================
-- Query 9: Check for failed initialization
-- =============================================================================
-- Purpose: Find tasks that failed during initialization
-- Expected: Empty or very low count

SELECT
  id,
  status,
  progress,
  current_step,
  error,
  created_at,
  completed_at
FROM agent_tasks
WHERE agent_type = 'research'
  AND status = 'failed'
  AND (
    current_step LIKE 'Initializing%'
    OR current_step LIKE 'Planning%'
    OR progress < 20
  )
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;

-- Expected output: Empty or rare failures
-- If many failures: Check error messages for common issues

-- =============================================================================
-- Query 10: Performance summary (last 24 hours)
-- =============================================================================
-- Purpose: Overall performance metrics
-- Expected: High success rate, reasonable avg duration

SELECT
  COUNT(*) AS total_tasks,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
  SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
  ROUND(
    100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) AS success_rate_percent,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))),
    1
  ) AS avg_duration_seconds,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (started_at - created_at))),
    1
  ) AS avg_queue_time_seconds,
  ROUND(AVG(tokens_used), 0) AS avg_tokens_used,
  ROUND(AVG(total_cost) / 100.0, 4) AS avg_cost_dollars
FROM agent_tasks
WHERE agent_type = 'research'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Expected output:
-- - success_rate_percent > 90%
-- - avg_duration_seconds: 60-180s
-- - avg_queue_time_seconds: < 60s (unless high load)
-- - running_count: 0 or 1
-- - pending_count: 0 (unless task just submitted)

-- =============================================================================
-- Usage Instructions
-- =============================================================================
--
-- Run all queries in sequence:
--   psql $DATABASE_URL -f scripts/verify-research-db.sql
--
-- Or run individual queries:
--   psql $DATABASE_URL -c "<paste query here>"
--
-- For continuous monitoring:
--   watch -n 5 'psql $DATABASE_URL -c "<Query 1>"'
--
-- =============================================================================
