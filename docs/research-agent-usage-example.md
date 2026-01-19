# Research Agent Framework - Usage Example

## Basic Agent Implementation

```typescript
import { BaseAgent, registerAgent, type AgentContext, type AgentResult } from '@/agents/base';

// 1. Define input and output types
interface MyAgentInput {
  query: string;
  maxResults?: number;
}

interface MyAgentOutput {
  results: string[];
  summary: string;
}

// 2. Create agent class extending BaseAgent
class MyAgent extends BaseAgent<MyAgentInput, MyAgentOutput> {
  constructor() {
    super({
      name: 'My Custom Agent',
      description: 'Performs custom research operations',
      version: '1.0.0',
      maxBudget: 100, // $1.00 maximum cost
      maxDuration: 60000, // 60 seconds timeout
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
      },
    });
  }

  /**
   * Main execution method - implement your agent logic here
   */
  async execute(
    input: MyAgentInput,
    context: AgentContext
  ): Promise<AgentResult<MyAgentOutput>> {
    const results: string[] = [];

    // Check if cancelled before starting
    if (await context.isCancelled()) {
      return {
        success: false,
        error: 'Task was cancelled',
        tokensUsed: 0,
        totalCost: 0,
      };
    }

    // Step 1: Initialize
    await context.updateProgress({
      progress: 10,
      currentStep: 'Initializing search',
      stepsCompleted: 1,
    });

    // Step 2: Perform search (example)
    await context.updateProgress({
      progress: 50,
      currentStep: 'Searching for results',
      stepsCompleted: 2,
    });

    // Simulate some work
    const searchResults = await this.performSearch(input.query);
    results.push(...searchResults);

    // Track AI usage (example: 500 tokens, $0.02)
    await context.addCost(500, 2);

    // Check budget after expensive operation
    const budgetOk = await context.checkBudget();
    if (!budgetOk) {
      return {
        success: false,
        error: 'Budget limit exceeded',
        tokensUsed: 500,
        totalCost: 2,
      };
    }

    // Step 3: Generate summary
    await context.updateProgress({
      progress: 90,
      currentStep: 'Generating summary',
      stepsCompleted: 3,
    });

    const summary = await this.generateSummary(results);

    // Track more AI usage
    await context.addCost(300, 1);

    // Return success
    return {
      success: true,
      data: {
        results,
        summary,
      },
      tokensUsed: 800,
      totalCost: 3,
    };
  }

  /**
   * Example helper method
   */
  private async performSearch(query: string): Promise<string[]> {
    // Implement your search logic here
    return [`Result 1 for ${query}`, `Result 2 for ${query}`];
  }

  /**
   * Example helper method
   */
  private async generateSummary(results: string[]): Promise<string> {
    // Implement your summary generation here
    return `Found ${results.length} results`;
  }

  /**
   * Override lifecycle hooks for custom behavior
   */
  protected async onStart(context: AgentContext): Promise<void> {
    await super.onStart(context);
    console.log(`[MyAgent] Starting task for user ${context.userId}`);
  }

  protected async onComplete(
    context: AgentContext,
    result: AgentResult<MyAgentOutput>
  ): Promise<void> {
    await super.onComplete(context, result);
    console.log(`[MyAgent] Completed with ${result.data?.results.length || 0} results`);
  }

  protected async onError(context: AgentContext, error: Error): Promise<void> {
    await super.onError(context, error);
    console.error(`[MyAgent] Failed:`, error.message);
  }
}

// 3. Register the agent
registerAgent(
  'my-agent', // Unique type identifier
  () => new MyAgent(), // Factory function
  new MyAgent().getConfig() // Agent configuration
);
```

## Using the Agent

### Option 1: Direct Usage

```typescript
import { getAgent, createTask, taskManager } from '@/agents/base';

async function runMyAgent(userId: string, query: string) {
  // 1. Create a task
  const task = await createTask(
    'my-agent',
    userId,
    { query, maxResults: 10 },
    {
      budgetLimit: 50, // $0.50 budget limit (in cents)
      totalSteps: 3,
      sessionId: 'optional-session-id',
    }
  );

  console.log('Task created:', task.id);

  // 2. Get the agent instance
  const agent = getAgent('my-agent');

  // 3. Create execution context
  const context = taskManager.createContext(task);

  // 4. Run the agent
  const result = await agent.run(
    { query, maxResults: 10 },
    context
  );

  if (result.success) {
    console.log('Results:', result.data);
    console.log('Cost:', result.totalCost, 'cents');
    console.log('Tokens:', result.tokensUsed);

    // Mark task as completed
    await taskManager.completeTask(task.id, result.data || {});
  } else {
    console.error('Failed:', result.error);

    // Mark task as failed
    await taskManager.failTask(task.id, result.error || 'Unknown error');
  }

  return result;
}
```

### Option 2: Via Inngest Events

```typescript
import { inngest } from '@/lib/events/client';
import { getAgent, getTask, taskManager } from '@/agents/base';

// Inngest function to handle research requests
export const researchAgent = inngest.createFunction(
  { id: 'research-agent' },
  { event: 'izzie/research.request' },
  async ({ event, step }) => {
    const { taskId, query, options } = event.data;

    // Get the task
    const task = await getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Emit started event
    await step.sendEvent('research-started', {
      name: 'izzie/research.started',
      data: { taskId },
    });

    // Update task status
    await taskManager.startTask(taskId);

    // Get agent and create context
    const agent = getAgent('my-agent');
    const context = taskManager.createContext(task);

    // Run the agent
    const result = await agent.run({ query, ...options }, context);

    if (result.success) {
      // Emit completed event
      await step.sendEvent('research-completed', {
        name: 'izzie/research.completed',
        data: { taskId, resultId: task.id },
      });

      // Update task
      await taskManager.completeTask(taskId, result.data || {});
    } else {
      // Emit failed event
      await step.sendEvent('research-failed', {
        name: 'izzie/research.failed',
        data: { taskId, error: result.error || 'Unknown error' },
      });

      // Update task
      await taskManager.failTask(taskId, result.error || 'Unknown error');
    }

    return result;
  }
);
```

## Task Management

### List User Tasks

```typescript
import { listTasks } from '@/agents/base';

// Get all tasks for a user
const allTasks = await listTasks(userId);

// Filter by status
const runningTasks = await listTasks(userId, { status: 'running' });

// Filter by agent type
const researchTasks = await listTasks(userId, { agentType: 'my-agent' });

// Pagination
const recentTasks = await listTasks(userId, {
  limit: 10,
  offset: 0,
});
```

### Monitor Task Progress

```typescript
import { getTask } from '@/agents/base';

// Poll for updates
const intervalId = setInterval(async () => {
  const task = await getTask(taskId);

  if (!task) {
    clearInterval(intervalId);
    return;
  }

  console.log('Progress:', task.progress, '%');
  console.log('Current step:', task.currentStep);
  console.log('Status:', task.status);

  if (task.status === 'completed' || task.status === 'failed') {
    clearInterval(intervalId);
  }
}, 1000);
```

### Cancel a Running Task

```typescript
import { cancelTask, getTask } from '@/agents/base';

// Cancel the task
await cancelTask(taskId);

// Agent will check context.isCancelled() and stop gracefully
```

### Get Task Statistics

```typescript
import { getTaskStats } from '@/agents/base';

const stats = await getTaskStats(userId);

console.log('Total tasks:', stats.total);
console.log('By status:', stats.byStatus);
console.log('By type:', stats.byType);
console.log('Total cost:', stats.totalCost, 'cents');
console.log('Total tokens:', stats.totalTokens);
```

## API Endpoint Example

```typescript
// /src/app/api/agents/my-agent/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createTask, getAgent, taskManager } from '@/agents/base';

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse input
  const body = await request.json();
  const { query, maxResults = 10 } = body;

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    // 3. Create task
    const task = await createTask(
      'my-agent',
      session.user.id,
      { query, maxResults },
      {
        budgetLimit: 100, // $1.00 limit
        totalSteps: 3,
      }
    );

    // 4. Start execution in background (don't await)
    const agent = getAgent('my-agent');
    const context = taskManager.createContext(task);

    // Execute async without blocking response
    agent.run({ query, maxResults }, context).then(async (result) => {
      if (result.success) {
        await taskManager.completeTask(task.id, result.data || {});
      } else {
        await taskManager.failTask(task.id, result.error || 'Unknown error');
      }
    });

    // 5. Return task ID immediately
    return NextResponse.json({
      success: true,
      taskId: task.id,
      message: 'Task started',
    });
  } catch (error) {
    console.error('Failed to start task:', error);
    return NextResponse.json(
      { error: 'Failed to start task' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  const task = await getTask(taskId);

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    task: {
      id: task.id,
      status: task.status,
      progress: task.progress,
      currentStep: task.currentStep,
      output: task.output,
      error: task.error,
      tokensUsed: task.tokensUsed,
      totalCost: task.totalCost,
    },
  });
}
```

## Best Practices

1. **Always check cancellation** in long-running operations:
   ```typescript
   if (await context.isCancelled()) {
     return { success: false, error: 'Cancelled', tokensUsed: 0, totalCost: 0 };
   }
   ```

2. **Update progress regularly** for better UX:
   ```typescript
   await context.updateProgress({
     progress: 50,
     currentStep: 'Processing...',
     stepsCompleted: 2,
   });
   ```

3. **Track all AI costs** for budget management:
   ```typescript
   await context.addCost(tokens, costInCents);
   ```

4. **Set realistic budgets** to prevent runaway costs:
   ```typescript
   const task = await createTask('agent-type', userId, input, {
     budgetLimit: 100, // $1.00 maximum
   });
   ```

5. **Use lifecycle hooks** for logging and monitoring:
   ```typescript
   protected async onError(context: AgentContext, error: Error) {
     await super.onError(context, error);
     // Log to monitoring service
     await logError(context.task.id, error);
   }
   ```
