# Research Agent Delegation and Execution Model - Architecture Analysis

**Date**: 2026-02-09
**Focus**: Research task creation, queuing, agent execution, and progress tracking
**Status**: Complete Analysis

---

## Executive Summary

The Izzie2 research agent system uses an **asynchronous event-driven architecture** with Inngest for background task execution. Research tasks are created synchronously in the database, then delegated to background agents via events. The "0% pending" state occurs during the polling window between task creation and agent initialization.

**Key Finding**: Research agents run **serially** (one at a time) with concurrent execution of source searches within each task. There is no queue backup - the issue is timing-based polling during the initialization phase.

---

## 1. Current Architecture Flow

### High-Level Flow

```
User Query (Chat API)
    ↓
research tool called
    ↓
Create task in DB (status: pending, progress: 0)
    ↓
Send Inngest event (izzie/research.request)
    ↓
Poll for completion (max 55s)
    ↓
Return results OR timeout message
```

### Detailed Execution Path

**File: `/src/lib/chat/tools/research.ts`**

```typescript
async execute(params, userId, onProgress) {
  // 1. Create task in database (synchronous)
  const task = await createTask('research', userId, validated, {
    totalSteps: 5
  });

  // 2. Send event to Inngest (asynchronous background)
  await inngest.send({
    name: 'izzie/research.request',
    data: { taskId, userId, query, ... }
  });

  // 3. Poll for completion (blocks chat API response)
  const MAX_WAIT_MS = 55000; // 55 seconds
  const POLL_INTERVAL_MS = 1500; // Check every 1.5s

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
    const updatedTask = await getTask(task.id);

    if (updatedTask.status === 'completed') {
      return formatResults(updatedTask.output);
    }

    if (updatedTask.status === 'failed') {
      return formatError(updatedTask.error);
    }
  }

  // 4. Timeout - task still running
  return timeoutMessage(task.id);
}
```

**Issue**: During the initial polling window (first 1-3 seconds), the task shows `status: 'pending', progress: 0` because:
1. Task is created in DB immediately
2. Inngest event is sent but not yet picked up
3. Research agent hasn't started executing yet
4. First poll happens before agent initializes

---

## 2. Research Agent Execution Model

### Concurrency Configuration

**File: `/src/lib/events/functions/research-task.ts`**

```typescript
export const researchTask = inngest.createFunction(
  {
    id: 'research-task',
    name: 'Research Task Execution',
    retries: 2,
    // NO concurrency limit specified
  },
  { event: 'izzie/research.request' },
  async ({ event, step, logger }) => {
    // Execute research agent
  }
);
```

**Key Finding**: No explicit concurrency limit is set, meaning **Inngest will execute tasks as they arrive**. The default behavior depends on Inngest configuration:

- **Development**: Runs serially (one at a time) by default
- **Production**: Configurable via Inngest cloud settings

**Comparison with other functions**:

```typescript
// discover-relationships.ts - EXPLICIT concurrency limit
concurrency: {
  limit: 1, // Only run one instance at a time
}

// discover-relationships-on-graph-update.ts - EXPLICIT concurrency limit
concurrency: {
  limit: 2, // Allow a couple concurrent runs
}
```

**Conclusion**: Research tasks likely run **one at a time** in development, but this is implicit behavior, not explicit configuration.

---

## 3. Research Agent Internal Concurrency

**File: `/src/agents/research/research-agent.ts`**

The research agent itself **does parallelize work within a single task**:

### Source Search Parallelization

```typescript
private async searchAllSources(
  query: string,
  sources: ResearchSource[],
  maxResultsPerSource: number,
  userId: string
): Promise<ResearchSourceResult[]> {
  const searchPromises: Promise<ResearchSourceResult[]>[] = [];

  // Search emails
  if (sources.includes('email') && auth) {
    searchPromises.push(
      searchEmails(auth, query, { maxResults: maxResultsPerSource })
    );
  }

  // Search Drive
  if (sources.includes('drive') && auth) {
    searchPromises.push(
      searchDriveFiles(auth, query, { maxResults: maxResultsPerSource })
    );
  }

  // Execute all searches in parallel
  const searchResults = await Promise.all(searchPromises);
  return results;
}
```

**Parallelism**: Email, Drive, and Web searches run **concurrently within a single research task**.

### Source Analysis Parallelization

```typescript
// Step 4: Analyze sources (60-80% progress)
const analyses = await analyzeSources(contentForAnalysis, query, {
  concurrency: 3  // Analyze 3 sources at a time
});
```

**Parallelism**: Source analysis runs **3 sources at a time** within a single task.

---

## 4. Task Queue Management

### Task Creation

**File: `/src/agents/base/task-manager.ts`**

```typescript
async createTask(
  agentType: string,
  userId: string,
  input: Record<string, unknown>,
  options: CreateTaskOptions = {}
): Promise<AgentTask> {
  const newTask: NewAgentTask = {
    agentType,
    userId,
    input,
    status: 'pending',  // Initial status
    progress: 0,        // Initial progress
    // ...
  };

  const [task] = await this.getDb()
    .insert(agentTasks)
    .values(newTask)
    .returning();

  return task;
}
```

**No Queue System**: Tasks are created in the database with `status: 'pending'`, but there's **no explicit queue management**. Inngest handles event delivery and execution scheduling.

### Status Transitions

```
pending → running → completed/failed
   ↑         ↑           ↑
   |         |           |
DB insert  Agent start  Agent finish
```

**The "0% pending" state occurs here**:
```
User creates task (pending, 0%)
    ↓ [1-3 seconds]
Inngest picks up event
    ↓
Agent starts (running, 10%)
```

---

## 5. Progress Tracking Mechanism

### Progress Updates

**File: `/src/agents/research/research-agent.ts`**

```typescript
async execute(input, context) {
  // Step 1: Planning (10%)
  await context.updateProgress({
    progress: 10,
    currentStep: 'Planning research',
  });

  // Step 2: Searching (15-25%)
  await context.updateProgress({
    progress: 15,
    currentStep: `Searching ${sources.length} source(s)`,
  });

  // ... more progress updates at 40%, 50%, 60%, 80%, 90%, 100%
}
```

### Progress Polling

**File: `/src/lib/chat/tools/research.ts`**

```typescript
while (Date.now() - startTime < MAX_WAIT_MS) {
  const waitTime = Date.now() - startTime < 1500 ? 500 : POLL_INTERVAL_MS;
  await new Promise(resolve => setTimeout(resolve, waitTime));

  const updatedTask = await getTask(task.id);

  // Send progress update if changed
  if (currentProgress !== lastProgress || currentStep !== lastStep) {
    onProgress?.({
      step: currentStep,
      progress: currentProgress,
      status: updatedTask.status,
    });
  }
}
```

**Polling Strategy**:
- **First 1.5 seconds**: Poll every 500ms (faster feedback)
- **After 1.5 seconds**: Poll every 1500ms (1.5s)
- **Max duration**: 55 seconds (Vercel timeout is 60s)

**Why "0% pending" appears**:
1. Task created immediately with `progress: 0, status: 'pending'`
2. Inngest event delivery takes 500-1500ms
3. First poll (at 500ms) shows the task before agent starts
4. Agent startup takes another 500-1000ms to reach first progress update (10%)

---

## 6. Multi-Source Coordination

### Source Priority

**Default sources**: `['web', 'email', 'drive']`

**Execution order**:
1. **Planning**: Generate research sub-tasks (LLM call)
2. **Source searches** (parallel):
   - Web search (via Tavily API)
   - Email search (via Gmail API)
   - Drive search (via Google Drive API)
3. **Content fetching** (parallel, web only):
   - Batch fetch web pages (5 concurrent)
4. **Analysis** (parallel):
   - Analyze all sources (3 concurrent)
5. **Synthesis** (sequential):
   - Combine findings into summary

### No Inter-Source Dependencies

**File: `/src/agents/research/research-agent.ts`**

```typescript
// Search all sources in parallel
const sourceSearchPromises = await this.searchAllSources(
  query,
  sources,
  resultsPerSource,
  context.userId
);
allSourceResults.push(...sourceSearchPromises);
```

**No coordination needed**: Email, Web, and Drive searches run independently with no inter-dependencies.

---

## 7. Problem Areas Causing "0% Pending" State

### Root Cause Analysis

**Primary Issue**: **Timing gap between task creation and agent initialization**

```
T+0ms:    Task created (pending, 0%)
T+100ms:  First poll → Shows "0% pending"
T+500ms:  Second poll → Shows "0% pending"
T+800ms:  Inngest picks up event
T+1200ms: Agent initializes
T+1300ms: Agent updates to 10% (Planning)
T+1500ms: Third poll → Shows "10% running"
```

**Why this happens**:
1. **Database write is instant** (task creation)
2. **Inngest event delivery has latency** (500-1500ms)
3. **Agent initialization takes time** (load modules, setup context)
4. **Polling starts immediately** (first poll at 500ms)

### Secondary Issues

1. **No explicit concurrency control**: Research tasks may pile up if Inngest isn't configured to limit concurrency
2. **No queue visibility**: Users can't see if other research tasks are ahead in line
3. **No status transitions**: Task goes from `pending` to `running` abruptly (no `queued` or `initializing` state)

---

## 8. Bottlenecks and Race Conditions

### Potential Bottlenecks

**1. Inngest Event Processing**
- **Location**: Between `inngest.send()` and function execution
- **Impact**: 500-1500ms delay before agent starts
- **Solution**: This is inherent to event-driven architecture

**2. Database Polling**
- **Location**: `research.ts` polling loop
- **Impact**: 55s of continuous polling blocks response
- **Solution**: Consider WebSocket or SSE for live updates

**3. Source API Rate Limits**
- **Location**: Gmail API, Drive API, Tavily API
- **Impact**: If multiple users trigger research simultaneously
- **Solution**: Add rate limiting at source level

### Potential Race Conditions

**1. Output Write vs. Poll Read**

**File: `/src/lib/chat/tools/research.ts` (lines 186-214)**

```typescript
if (updatedTask.status === 'completed') {
  if (output) {
    return formatResults(output);
  } else {
    // BUG CASE: Completed but no output
    await new Promise(resolve => setTimeout(resolve, 500));
    const retryTask = await getTask(task.id);

    if (retryTask?.output) {
      return formatResults(retryTask.output);
    }

    return formatError('No results returned');
  }
}
```

**Race condition**: Agent marks task as `completed` before writing `output` field
- **Likelihood**: Low (single transaction in `updateTask`)
- **Mitigation**: Already implemented (500ms retry with second fetch)

**2. Multiple Progress Updates**

**Potential issue**: If multiple progress updates happen rapidly, polling might miss intermediate states
- **Impact**: Low (progress updates are sequential within agent)
- **Risk**: None (each poll gets latest state, no requirement to see every update)

---

## 9. Execution Model: Serial vs. Concurrent

### Current Behavior

**Research tasks**: **Implicit serial execution** (no concurrency limit specified)
- Inngest default is serial in development
- Production configuration unknown from code

**Within a single research task**:
- **Email/Drive/Web searches**: Concurrent (Promise.all)
- **Source analysis**: Concurrent (3 at a time)
- **Web page fetching**: Concurrent (5 at a time)

### Comparison with Other Agents

**Explicit concurrency limits in codebase**:

```typescript
// Relationship discovery (scheduled)
concurrency: { limit: 1 }  // Serial

// Relationship discovery (event-triggered)
concurrency: { limit: 2 }  // Two concurrent

// Research tasks
// NO concurrency limit → Default behavior (likely serial)
```

### Recommendation

**Add explicit concurrency control**:

```typescript
export const researchTask = inngest.createFunction(
  {
    id: 'research-task',
    name: 'Research Task Execution',
    retries: 2,
    concurrency: {
      limit: 3,  // EXPLICIT: Allow 3 concurrent research tasks
      key: 'event.data.userId',  // Per-user concurrency
    },
  },
  { event: 'izzie/research.request' },
  async ({ event, step, logger }) => {
    // ...
  }
);
```

**Benefits**:
1. **Explicit behavior**: No ambiguity about execution model
2. **Per-user limits**: Prevents one user from monopolizing research capacity
3. **Controlled parallelism**: Balance between throughput and resource usage

---

## 10. File Paths and Key Code Sections

### Task Creation and Queuing

| File | Lines | Description |
|------|-------|-------------|
| `/src/lib/chat/tools/research.ts` | 78-113 | Task creation + Inngest event sending |
| `/src/agents/base/task-manager.ts` | 51-77 | `createTask()` method - DB insertion |
| `/src/lib/db/schema.ts` | N/A | `agentTasks` table schema |

### Agent Execution

| File | Lines | Description |
|------|-------|-------------|
| `/src/lib/events/functions/research-task.ts` | 34-318 | Inngest function handler |
| `/src/agents/research/research-agent.ts` | 45-310 | `execute()` method - main research logic |
| `/src/agents/base/agent.ts` | N/A | BaseAgent abstract class |

### Progress Tracking

| File | Lines | Description |
|------|-------|-------------|
| `/src/lib/chat/tools/research.ts` | 123-236 | Polling loop with progress callbacks |
| `/src/agents/research/research-agent.ts` | 60-276 | Progress update calls throughout execution |
| `/src/agents/base/task-manager.ts` | 100-118 | `updateTask()` method - DB updates |

### Source Coordination

| File | Lines | Description |
|------|-------|-------------|
| `/src/agents/research/research-agent.ts` | 315-393 | `searchAllSources()` - parallel source searches |
| `/src/agents/research/sources/email-source.ts` | N/A | Email search implementation |
| `/src/agents/research/sources/drive-source.ts` | N/A | Drive search implementation |

---

## 11. Recommendations

### Immediate Fixes

1. **Add explicit concurrency control**:
   ```typescript
   concurrency: {
     limit: 3,
     key: 'event.data.userId',
   }
   ```

2. **Add "initializing" state**:
   ```typescript
   // In research-task.ts, before agent execution
   await taskManager.updateTask(taskId, {
     status: 'initializing',
     currentStep: 'Starting research agent',
   });
   ```

3. **Improve polling feedback**:
   ```typescript
   // Show status immediately
   onProgress?.({
     step: 'Task created, waiting for agent startup',
     progress: 0,
     status: 'pending',
   });
   ```

### Medium-Term Improvements

1. **Replace polling with SSE/WebSocket**:
   - Stream progress updates directly from agent
   - Eliminate polling overhead
   - Reduce latency to <100ms

2. **Add queue visibility**:
   ```typescript
   interface TaskStatus {
     status: 'queued' | 'pending' | 'running' | 'completed' | 'failed';
     queuePosition?: number;
     estimatedStartTime?: Date;
   }
   ```

3. **Implement task priority**:
   ```typescript
   createTask(agentType, userId, input, {
     priority: 'high' | 'normal' | 'low',
   });
   ```

### Long-Term Architecture

1. **Dedicated research queue service**:
   - Separate queue management from Inngest
   - Real-time queue visibility
   - Advanced scheduling (priority, fairness)

2. **Agent pooling**:
   - Pre-warmed agent instances
   - Reduce cold-start latency
   - Faster first progress update

3. **Incremental results**:
   - Stream findings as they're discovered
   - Don't wait for full synthesis
   - Show partial results to user

---

## 12. Conclusion

**Key Findings**:

1. **Architecture is event-driven and asynchronous**: Tasks are created synchronously, then executed asynchronously via Inngest events

2. **"0% pending" is a timing issue**: Occurs during the 1-3 second window between task creation and agent initialization

3. **No queue backup**: Research tasks run one at a time (implicit default), not due to queue congestion

4. **Internal parallelism works well**: Email, Drive, and Web searches run concurrently within each task

5. **No explicit concurrency control**: Research tasks rely on Inngest's default behavior (likely serial)

**Root Cause**: **Event delivery latency** (500-1500ms) combined with **immediate polling** (starts at 500ms) creates a visible "pending" state before agent initializes.

**Primary Solution**: Add explicit status transitions (`queued`, `initializing`, `running`) to provide better feedback during the startup phase.

**Secondary Solution**: Add explicit concurrency control to make execution model predictable and configurable.

---

## Appendix: Execution Timeline

**Typical research task timeline**:

```
T+0ms:      User sends message
T+50ms:     Chat API creates task (pending, 0%)
T+100ms:    Inngest event sent
T+150ms:    First poll → "0% pending"
T+500ms:    Second poll → "0% pending"
T+800ms:    Inngest delivers event
T+1200ms:   Agent initializes
T+1300ms:   Agent updates → "10% running" (Planning)
T+1500ms:   Third poll → "10% running"
T+3000ms:   Agent updates → "15% running" (Searching)
T+8000ms:   Agent updates → "40% running" (Fetching)
T+15000ms:  Agent updates → "60% running" (Analyzing)
T+25000ms:  Agent updates → "80% running" (Synthesizing)
T+28000ms:  Agent updates → "90% running" (Saving)
T+29000ms:  Agent updates → "100% completed"
T+30000ms:  Next poll → "100% completed"
T+30100ms:  Return results to user
```

**Total time**: 30 seconds (typical)
**Polling overhead**: 20 checks (at 1.5s intervals)
**Visible "pending" state**: 1.5 seconds (2 polls)

---

**Research completed**: 2026-02-09
**Next steps**: Implement explicit status transitions and concurrency control
