# Research API - Quick Start Guide

## Overview
The Research API enables users to conduct comprehensive web research programmatically or via chat. Research tasks run asynchronously in the background and can be monitored in real-time.

## Quick Examples

### Start Research via Chat (Easiest)

```typescript
// User message in chat
"Research the latest developments in quantum computing"

// Izzie automatically:
// 1. Calls the research tool
// 2. Creates a task
// 3. Returns results when complete (or progress update if longer)
```

### Start Research via API

```typescript
// POST /api/research
const response = await fetch('/api/research', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Authentication cookies automatically included
  },
  body: JSON.stringify({
    query: 'Latest developments in quantum computing',
    maxSources: 5,
    context: 'Focus on practical applications and recent breakthroughs'
  })
});

const { taskId, status } = await response.json();
// Returns: { taskId: "abc123", status: "started" }
```

### Check Status

```typescript
// GET /api/research/:taskId
const response = await fetch(`/api/research/${taskId}`);
const { task, output } = await response.json();

console.log(task.status); // "pending" | "running" | "completed" | "failed" | "paused"
console.log(task.progress); // 0-100
console.log(task.currentStep); // "Analyzing sources"

if (task.status === 'completed') {
  console.log(output.summary);
  console.log(output.findings);
  console.log(output.sources);
}
```

### Stream Progress (Real-time)

```typescript
// GET /api/research/:taskId/stream
const eventSource = new EventSource(`/api/research/${taskId}/stream`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'progress':
      console.log(`${data.data.progress}%: ${data.data.currentStep}`);
      break;

    case 'complete':
      console.log('Research complete!', data.data.summary);
      eventSource.close();
      break;

    case 'error':
      console.error('Research failed:', data.data.message);
      eventSource.close();
      break;
  }
};
```

## API Reference

### POST /api/research
Start a new research task.

**Request Body:**
```typescript
{
  query: string;              // Required: Research question
  context?: string;           // Optional: Additional focus areas
  maxSources?: number;        // Optional: 1-20, default 5
  maxDepth?: number;          // Optional: 1-3, default 1
  focusAreas?: string[];      // Optional: Specific topics to focus on
  excludeDomains?: string[];  // Optional: Domains to exclude
}
```

**Response (201):**
```typescript
{
  taskId: string;
  status: "started";
  message: string;
}
```

### GET /api/research
List all research tasks for the current user.

**Query Parameters:**
- `status` - Filter by status (pending, running, completed, failed, paused)
- `limit` - Max results (1-100, default 20)
- `offset` - Pagination offset (default 0)

**Response (200):**
```typescript
{
  tasks: Array<{
    id: string;
    status: string;
    query: string;
    progress: number;
    currentStep: string | null;
    tokensUsed: number;
    totalCost: number;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

### GET /api/research/:taskId
Get task details and results.

**Response (200):**
```typescript
{
  task: {
    id: string;
    status: string;
    query: string;
    progress: number;
    currentStep: string | null;
    stepsCompleted: number;
    totalSteps: number;
    tokensUsed: number;
    totalCost: number;
    error: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  output?: ResearchOutput; // Only if status === "completed"
}
```

### DELETE /api/research/:taskId
Cancel a running task.

**Response (200):**
```typescript
{
  success: true;
  message: "Task cancelled successfully";
}
```

### POST /api/research/:taskId/pause
Pause a running task.

**Response (200):**
```typescript
{
  success: true;
  message: "Task paused successfully";
}
```

### POST /api/research/:taskId/resume
Resume a paused task.

**Response (200):**
```typescript
{
  success: true;
  message: "Task resumed successfully";
}
```

### GET /api/research/:taskId/stream
Stream task progress via Server-Sent Events.

**Response:** text/event-stream

**Event Types:**
```typescript
// Progress update
{
  type: "progress";
  data: {
    status: string;
    progress: number;
    currentStep: string;
    stepsCompleted: number;
    totalSteps: number;
  };
}

// Completion
{
  type: "complete";
  data: {
    summary: string;
    tokensUsed: number;
    totalCost: number;
  };
}

// Error
{
  type: "error";
  data: {
    message: string;
  };
}

// Cancelled
{
  type: "cancelled";
  data: {
    message: string;
  };
}
```

## ResearchOutput Schema

When a task completes, the `output` field contains:

```typescript
{
  summary: string;          // Executive summary of findings

  findings: Array<{
    claim: string;          // Key finding or claim
    evidence: string;       // Supporting evidence
    confidence: number;     // Confidence score (0-1)
    sourceUrl: string;      // Source URL
    sourceTitle: string;    // Source title
  }>;

  sources: Array<{
    url: string;            // Source URL
    title: string;          // Page title
    relevanceScore: number; // Relevance (0-1)
    credibilityScore: number; // Credibility (0-1)
  }>;

  metadata: {
    tokensUsed: number;     // Total tokens consumed
    totalCost: number;      // Total cost in cents
    sourcesAnalyzed: number; // Number of sources analyzed
  };
}
```

## Error Responses

All endpoints return consistent error formats:

**400 Bad Request:**
```typescript
{
  error: "Invalid request data";
  details: [/* Zod validation errors */];
}
```

**403 Forbidden:**
```typescript
{
  error: "Unauthorized - task does not belong to user";
}
```

**404 Not Found:**
```typescript
{
  error: "Task not found";
}
```

**500 Internal Server Error:**
```typescript
{
  error: "Failed to create research task";
  details: "Error message";
}
```

## Usage Tips

### Best Practices
1. **Use specific queries** - "AI agent frameworks in 2025" > "AI"
2. **Provide context** - Helps focus research on relevant aspects
3. **Set appropriate maxSources** - More sources = more comprehensive but slower
4. **Monitor costs** - Check `totalCost` field to track spending
5. **Use streaming** - Better UX for long-running tasks

### Performance Expectations
- **Simple queries:** 10-20 seconds
- **Standard queries:** 30-60 seconds
- **Complex queries:** 1-2 minutes

### Rate Limits
Currently no rate limits, but consider implementing:
- 10 concurrent tasks per user
- 100 tasks per day per user

## Frontend Integration Examples

### React Hook

```typescript
function useResearch(query: string) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [data, setData] = useState<ResearchOutput | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!query) return;

    async function runResearch() {
      setStatus('loading');

      // Start research
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxSources: 5 }),
      });

      const { taskId } = await response.json();

      // Stream progress
      const eventSource = new EventSource(`/api/research/${taskId}/stream`);

      eventSource.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);

        if (type === 'progress') {
          setProgress(data.progress);
        } else if (type === 'complete') {
          // Get full results
          fetch(`/api/research/${taskId}`)
            .then(r => r.json())
            .then(({ output }) => {
              setData(output);
              setStatus('success');
            });
          eventSource.close();
        } else if (type === 'error') {
          setStatus('error');
          eventSource.close();
        }
      };
    }

    runResearch();
  }, [query]);

  return { status, data, progress };
}
```

### Vue Composable

```typescript
export function useResearch() {
  const taskId = ref<string | null>(null);
  const progress = ref(0);
  const results = ref<ResearchOutput | null>(null);
  const error = ref<string | null>(null);

  async function startResearch(query: string, options?: ResearchOptions) {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...options }),
    });

    const data = await response.json();
    taskId.value = data.taskId;

    // Stream progress
    const eventSource = new EventSource(`/api/research/${data.taskId}/stream`);

    eventSource.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);

      if (type === 'progress') {
        progress.value = data.progress;
      } else if (type === 'complete') {
        fetch(`/api/research/${taskId.value}`)
          .then(r => r.json())
          .then(({ output }) => {
            results.value = output;
          });
        eventSource.close();
      }
    };
  }

  return {
    taskId,
    progress,
    results,
    error,
    startResearch,
  };
}
```

## Troubleshooting

### Task stuck in "pending" status
- Check Inngest is running and processing events
- Verify `izzie/research.request` event was sent
- Check Inngest logs for errors

### Task fails immediately
- Check query is valid (not empty)
- Verify user has sufficient API credits
- Review error message in task.error field

### SSE stream disconnects
- Browser limits concurrent SSE connections (usually 6)
- Close unused streams
- Consider polling GET /api/research/:taskId instead

### Results incomplete
- Increase maxSources parameter
- Provide more specific context
- Check for quota/rate limit issues

## Next Steps

- See [RESEARCH-AGENT-API-IMPLEMENTATION.md](../RESEARCH-AGENT-API-IMPLEMENTATION.md) for full technical details
- Review [/src/agents/research/](../src/agents/research/) for core research logic
- Check [/src/lib/events/functions/research-task.ts](../src/lib/events/functions/research-task.ts) for Inngest implementation
