# Agent Framework Quick Start Guide

Complete guide to using the Izzie2 Agent Framework for building autonomous agents.

---

## Table of Contents

1. [Installation](#installation)
2. [Creating Your First Agent](#creating-your-first-agent)
3. [Task Management](#task-management)
4. [Progress & Cost Tracking](#progress--cost-tracking)
5. [Event Integration](#event-integration)
6. [Database Schema](#database-schema)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

---

## Installation

### 1. Push Database Schema

```bash
pnpm drizzle-kit push
```

This creates the three agent tables:
- `agent_tasks` - Task lifecycle and tracking
- `research_sources` - Source content cache
- `research_findings` - Extracted insights with embeddings

### 2. Run Migration Script

```bash
pnpm tsx scripts/migrate-agent-tables.ts
```

This creates vector indexes for semantic search.

### 3. Verify Setup

```bash
pnpm tsx -e "
import { agentRegistry, taskManager } from './src/agents/base/index.ts';
console.log('Registry:', agentRegistry.getStats());
console.log('✅ Agent framework ready!');
"
```

---

## Creating Your First Agent

### Step 1: Extend BaseAgent

```typescript
// src/agents/my-agent/agent.ts
import { BaseAgent } from '@/agents/base';
import type { AgentContext, AgentResult, AgentConfig } from '@/agents/base';

// Define input/output types
interface MyAgentInput {
  query: string;
  options?: {
    maxResults?: number;
  };
}

interface MyAgentOutput {
  results: string[];
  summary: string;
}

export class MyAgent extends BaseAgent<MyAgentInput, MyAgentOutput> {
  constructor() {
    const config: AgentConfig = {
      name: 'My Agent',
      description: 'Does something useful',
      version: '1.0.0',
      maxBudget: 1.0, // $1 max
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
      },
    };
    super(config);
  }

  async execute(
    input: MyAgentInput,
    context: AgentContext
  ): Promise<AgentResult<MyAgentOutput>> {
    try {
      // Step 1: Initialize
      await this.onProgress(context, 'Starting search', 10);

      // Step 2: Process
      const results = await this.doWork(input, context);
      await this.onProgress(context, 'Processing results', 50);

      // Step 3: Track costs
      await context.addCost(100, 0.01); // 100 tokens, $0.01

      // Step 4: Check if cancelled
      if (await context.isCancelled()) {
        return {
          success: false,
          error: 'Task was cancelled',
          tokensUsed: context.task.tokensUsed,
          totalCost: context.task.totalCost,
        };
      }

      // Step 5: Finalize
      await this.onProgress(context, 'Finalizing', 90);

      return {
        success: true,
        data: {
          results,
          summary: `Found ${results.length} results`,
        },
        tokensUsed: context.task.tokensUsed,
        totalCost: context.task.totalCost,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: context.task.tokensUsed,
        totalCost: context.task.totalCost,
      };
    }
  }

  private async doWork(
    input: MyAgentInput,
    context: AgentContext
  ): Promise<string[]> {
    // Your agent logic here
    return ['result1', 'result2'];
  }
}
```

### Step 2: Register the Agent

```typescript
// src/agents/my-agent/index.ts
import { registerAgent } from '@/agents/base';
import { MyAgent } from './agent';

// Register on module load
registerAgent(
  'my-agent', // Unique type identifier
  () => new MyAgent(), // Factory function
  {
    name: 'My Agent',
    description: 'Does something useful',
    version: '1.0.0',
  }
);

export { MyAgent };
```

### Step 3: Use the Agent

```typescript
import { agentRegistry, taskManager } from '@/agents/base';
import '@/agents/my-agent'; // Register the agent

async function runMyAgent() {
  // 1. Create a task
  const task = await taskManager.createTask(
    'my-agent', // Agent type
    'user-123', // User ID
    { query: 'Search query', options: { maxResults: 10 } }, // Input
    {
      budgetLimit: 100, // $1.00 in cents
      totalSteps: 5,
      sessionId: 'session-abc',
    }
  );

  // 2. Get the agent instance
  const agent = agentRegistry.get('my-agent');

  // 3. Create execution context
  const context = taskManager.createContext(task);

  // 4. Run the agent
  const result = await agent.run(
    { query: 'Search query', options: { maxResults: 10 } },
    context
  );

  // 5. Handle result
  if (result.success) {
    console.log('Success!', result.data);
    await taskManager.completeTask(task.id, result.data);
  } else {
    console.error('Failed:', result.error);
    await taskManager.failTask(task.id, result.error || 'Unknown error');
  }
}
```

---

## Task Management

### Create a Task

```typescript
import { taskManager } from '@/agents/base';

const task = await taskManager.createTask(
  'research', // Agent type
  'user-123', // User ID
  { query: 'What is TypeScript?' }, // Input
  {
    budgetLimit: 100, // $1.00 max
    totalSteps: 10, // Expected steps
    sessionId: 'session-abc', // Optional session
    parentTaskId: 'parent-task-id', // Optional parent
  }
);
```

### Get Task Status

```typescript
const task = await taskManager.getTask('task-id');

console.log({
  status: task.status, // 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  progress: task.progress, // 0-100
  currentStep: task.currentStep,
  tokensUsed: task.tokensUsed,
  totalCost: task.totalCost, // in cents
});
```

### List Tasks

```typescript
const tasks = await taskManager.listTasks('user-123', {
  agentType: 'research',
  status: 'running',
  limit: 10,
  offset: 0,
});
```

### Cancel a Task

```typescript
await taskManager.cancelTask('task-id');
// Task status set to 'paused'
// Agent will check context.isCancelled() and stop
```

### Task Statistics

```typescript
const stats = await taskManager.getStats('user-123');

console.log({
  total: stats.total,
  byStatus: stats.byStatus, // { running: 2, completed: 5, ... }
  byType: stats.byType, // { research: 3, classifier: 4, ... }
  totalCost: stats.totalCost, // Total cost in cents
  totalTokens: stats.totalTokens,
});
```

---

## Progress & Cost Tracking

### Update Progress

```typescript
// In your agent's execute() method
await context.updateProgress({
  progress: 50, // 0-100
  currentStep: 'Fetching sources',
  stepsCompleted: 3,
});
```

### Track Costs

```typescript
// After API calls
await context.addCost(
  150, // Tokens used
  0.015 // Cost in dollars (converted to cents internally)
);
```

### Check Budget

```typescript
const withinBudget = await context.checkBudget();
if (!withinBudget) {
  throw new Error('Budget limit exceeded');
}
```

### Check Cancellation

```typescript
if (await context.isCancelled()) {
  return {
    success: false,
    error: 'Task was cancelled by user',
    tokensUsed: context.task.tokensUsed,
    totalCost: context.task.totalCost,
  };
}
```

---

## Event Integration

### Emit Inngest Events

```typescript
// src/lib/events/client.ts
import { inngest } from '@/lib/events/client';
import type { Events } from '@/lib/events/types';

// Emit research request
await inngest.send({
  name: 'izzie/research.request',
  data: {
    taskId: 'task-123',
    query: 'What is TypeScript?',
    options: {
      maxSources: 10,
      maxDepth: 2,
    },
  },
});

// Emit progress update
await inngest.send({
  name: 'izzie/research.progress',
  data: {
    taskId: 'task-123',
    progress: 50,
    step: 'Fetching sources',
  },
});

// Emit completion
await inngest.send({
  name: 'izzie/research.completed',
  data: {
    taskId: 'task-123',
    resultId: 'result-456',
  },
});
```

### Create Inngest Function

```typescript
// src/lib/events/functions/research-handler.ts
import { inngest } from '@/lib/events/client';
import { agentRegistry, taskManager } from '@/agents/base';

export const researchHandler = inngest.createFunction(
  { id: 'research-handler' },
  { event: 'izzie/research.request' },
  async ({ event, step }) => {
    const { taskId, query, options } = event.data;

    // Get existing task or create new one
    let task = await taskManager.getTask(taskId);
    if (!task) {
      task = await taskManager.createTask(
        'research',
        event.user.id,
        { query, options }
      );
    }

    // Get agent and execute
    const agent = agentRegistry.get('research');
    const context = taskManager.createContext(task);

    const result = await agent.run({ query, options }, context);

    // Emit completion event
    if (result.success) {
      await inngest.send({
        name: 'izzie/research.completed',
        data: { taskId, resultId: task.id },
      });
    } else {
      await inngest.send({
        name: 'izzie/research.failed',
        data: { taskId, error: result.error || 'Unknown error' },
      });
    }

    return result;
  }
);
```

---

## Database Schema

### Agent Tasks Table

```typescript
import { db } from '@/lib/db';
import { agentTasks, type AgentTask, type NewAgentTask } from '@/lib/db/schema';

// Query tasks
const tasks = await db
  .select()
  .from(agentTasks)
  .where(eq(agentTasks.userId, 'user-123'))
  .orderBy(desc(agentTasks.createdAt));

// Insert task
const [newTask] = await db
  .insert(agentTasks)
  .values({
    agentType: 'research',
    userId: 'user-123',
    input: { query: 'TypeScript' },
    status: 'pending',
    progress: 0,
    stepsCompleted: 0,
    totalSteps: 10,
    tokensUsed: 0,
    totalCost: 0,
  })
  .returning();
```

### Research Sources Table

```typescript
import { researchSources, type ResearchSource } from '@/lib/db/schema';

// Insert source
const [source] = await db
  .insert(researchSources)
  .values({
    taskId: 'task-123',
    url: 'https://example.com',
    title: 'Example Article',
    content: 'Article content...',
    relevanceScore: 85,
    credibilityScore: 90,
    fetchStatus: 'fetched',
  })
  .returning();

// Query sources by task
const sources = await db
  .select()
  .from(researchSources)
  .where(eq(researchSources.taskId, 'task-123'));
```

### Research Findings Table (with Vector Search)

```typescript
import { researchFindings, type ResearchFinding } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

// Insert finding with embedding
const [finding] = await db
  .insert(researchFindings)
  .values({
    taskId: 'task-123',
    sourceId: 'source-456',
    claim: 'TypeScript adds static typing to JavaScript',
    evidence: 'According to the TypeScript documentation...',
    confidence: 95,
    citation: 'typescriptlang.org',
    embedding: embedding, // number[] from OpenAI
  })
  .returning();

// Semantic search (cosine similarity)
const similarFindings = await db.execute(sql`
  SELECT
    id,
    claim,
    evidence,
    confidence,
    1 - (embedding <=> ${sql.raw(`'[${queryEmbedding.join(',')}]'`)}) as similarity
  FROM research_findings
  WHERE task_id = ${taskId}
  ORDER BY embedding <=> ${sql.raw(`'[${queryEmbedding.join(',')}]'`)}
  LIMIT 10
`);
```

---

## Best Practices

### 1. Always Use Lifecycle Hooks

```typescript
class MyAgent extends BaseAgent<Input, Output> {
  async execute(input: Input, context: AgentContext) {
    // ✅ Use onProgress for updates
    await this.onProgress(context, 'Processing', 50);

    // ❌ Don't update manually
    // await context.updateProgress({ progress: 50 });
  }
}
```

### 2. Track Costs After API Calls

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
});

const tokens = response.usage?.total_tokens || 0;
const cost = calculateCost(tokens, 'gpt-4'); // Your cost calculator

await context.addCost(tokens, cost);
```

### 3. Check Cancellation in Long Operations

```typescript
for (const item of items) {
  // Check before processing each item
  if (await context.isCancelled()) {
    return {
      success: false,
      error: 'Cancelled by user',
      tokensUsed: context.task.tokensUsed,
      totalCost: context.task.totalCost,
    };
  }

  await processItem(item);
}
```

### 4. Use Budget Limits

```typescript
// Set budget when creating task
const task = await taskManager.createTask(
  'research',
  'user-123',
  { query: 'Expensive query' },
  { budgetLimit: 50 } // $0.50 max
);

// Check budget periodically in agent
if (!(await context.checkBudget())) {
  throw new Error('Budget exceeded');
}
```

### 5. Handle Errors Gracefully

```typescript
async execute(input: Input, context: AgentContext) {
  try {
    // Your logic
  } catch (error) {
    // Don't throw - return error result
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      tokensUsed: context.task.tokensUsed,
      totalCost: context.task.totalCost,
    };
  }
}
```

---

## Examples

### Example 1: Simple Search Agent

```typescript
class SearchAgent extends BaseAgent<{ query: string }, { results: string[] }> {
  async execute(input, context) {
    await this.onProgress(context, 'Searching', 25);

    const results = await fetch(`/api/search?q=${input.query}`).then(r =>
      r.json()
    );

    await context.addCost(10, 0.001);
    await this.onProgress(context, 'Complete', 100);

    return {
      success: true,
      data: { results },
      tokensUsed: 10,
      totalCost: 0.001,
    };
  }
}
```

### Example 2: Multi-Step Research Agent

```typescript
class ResearchAgent extends BaseAgent<ResearchInput, ResearchOutput> {
  async execute(input, context) {
    const steps = [
      { name: 'Search', progress: 20 },
      { name: 'Fetch', progress: 40 },
      { name: 'Analyze', progress: 60 },
      { name: 'Synthesize', progress: 80 },
      { name: 'Complete', progress: 100 },
    ];

    let findings = [];

    for (const [index, step] of steps.entries()) {
      await this.onProgress(context, step.name, step.progress);

      if (await context.isCancelled()) {
        return this.cancelledResult(context);
      }

      switch (step.name) {
        case 'Search':
          findings = await this.searchWeb(input.query);
          break;
        case 'Fetch':
          await this.fetchSources(findings, context);
          break;
        case 'Analyze':
          await this.analyzeSources(findings, context);
          break;
        case 'Synthesize':
          await this.synthesizeFindings(findings, context);
          break;
      }
    }

    return {
      success: true,
      data: { findings },
      tokensUsed: context.task.tokensUsed,
      totalCost: context.task.totalCost,
    };
  }

  private cancelledResult(context: AgentContext) {
    return {
      success: false,
      error: 'Task cancelled',
      tokensUsed: context.task.tokensUsed,
      totalCost: context.task.totalCost,
    };
  }
}
```

### Example 3: Agent with Retry Logic

```typescript
class RobustAgent extends BaseAgent<Input, Output> {
  constructor() {
    super({
      name: 'Robust Agent',
      description: 'Handles failures gracefully',
      version: '1.0.0',
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000, // 1s, 2s, 4s backoff
      },
    });
  }

  async execute(input, context) {
    let attempt = 0;

    while (true) {
      try {
        attempt++;
        const result = await this.doWork(input);

        return {
          success: true,
          data: result,
          tokensUsed: 0,
          totalCost: 0,
        };
      } catch (error) {
        const shouldRetry = await this.shouldRetry(attempt, error, context);

        if (!shouldRetry) {
          return {
            success: false,
            error: error.message,
            tokensUsed: 0,
            totalCost: 0,
          };
        }

        // Wait with exponential backoff
        const delay = this.getRetryDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
```

---

## Additional Resources

- **Base Agent Code**: `/src/agents/base/agent.ts`
- **Task Manager**: `/src/agents/base/task-manager.ts`
- **Registry**: `/src/agents/base/registry.ts`
- **Schema**: `/src/lib/db/schema.ts` (lines 721-864)
- **Events**: `/src/lib/events/types.ts` (lines 229-401)
- **Migration**: `/scripts/migrate-agent-tables.ts`

---

**Questions?** Check the implementation summary: `PHASE1_IMPLEMENTATION_SUMMARY.md`
