# Base Agent Framework

Foundation for all agent implementations in Izzie. Provides task management, progress tracking, cost monitoring, and lifecycle management for long-running AI operations.

## Overview

The base agent framework provides:

- **BaseAgent**: Abstract class for all agents with lifecycle hooks
- **Agent Registry**: Singleton registry for agent discovery and instantiation
- **Task Manager**: Database-backed task CRUD operations with Drizzle ORM
- **Type Safety**: Full TypeScript types for agents, tasks, and contexts
- **Cost Tracking**: Per-task token usage and cost monitoring
- **Budget Enforcement**: Configurable budget limits per task
- **Progress Tracking**: Real-time progress updates (0-100%)
- **Cancellation Support**: Graceful task cancellation
- **Retry Logic**: Configurable retry with exponential backoff

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Registry                           │
│  registerAgent() → getAgent() → BaseAgent Instance          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Task Manager                            │
│  createTask() → Database (agent_tasks table)                │
│  createContext() → AgentContext with utilities              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      BaseAgent                               │
│  onStart() → execute() → onComplete()                       │
│          ↓                     ↓                             │
│     updateProgress()      addCost()                         │
│     checkBudget()         isCancelled()                     │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Create an Agent

```typescript
import { BaseAgent, type AgentContext, type AgentResult } from '@/agents/base';

class MyAgent extends BaseAgent<MyInput, MyOutput> {
  constructor() {
    super({
      name: 'My Agent',
      description: 'Does something useful',
      version: '1.0.0',
      maxBudget: 100, // $1.00
      maxDuration: 60000, // 60s
    });
  }

  async execute(input: MyInput, context: AgentContext): Promise<AgentResult<MyOutput>> {
    // Your agent logic here
    await context.updateProgress({ progress: 50, currentStep: 'Processing' });
    await context.addCost(1000, 5); // 1000 tokens, $0.05

    return {
      success: true,
      data: { result: 'Success!' },
      tokensUsed: 1000,
      totalCost: 5,
    };
  }
}
```

### 2. Register the Agent

```typescript
import { registerAgent } from '@/agents/base';

registerAgent('my-agent', () => new MyAgent(), new MyAgent().getConfig());
```

### 3. Run the Agent

```typescript
import { getAgent, createTask, taskManager } from '@/agents/base';

// Create task
const task = await createTask('my-agent', userId, input);

// Get agent and context
const agent = getAgent('my-agent');
const context = taskManager.createContext(task);

// Execute
const result = await agent.run(input, context);
```

## API Reference

### BaseAgent

Abstract class that all agents extend.

#### Constructor

```typescript
constructor(config: AgentConfig)
```

#### Abstract Methods

- `execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>`
  - **Must be implemented by subclasses**
  - Contains the core agent logic

#### Lifecycle Hooks

- `onStart(context: AgentContext): Promise<void>`
  - Called before execution starts
  - Default: Updates progress to 0%

- `onProgress(context: AgentContext, step: string, progress: number): Promise<void>`
  - Called when progress updates
  - Default: Logs progress

- `onComplete(context: AgentContext, result: AgentResult): Promise<void>`
  - Called after successful execution
  - Default: Updates progress to 100%

- `onError(context: AgentContext, error: Error): Promise<void>`
  - Called when execution fails
  - Default: Logs error

#### Public Methods

- `run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>`
  - Main execution wrapper with lifecycle management
  - Handles cancellation, budget checks, and error handling

- `getConfig(): AgentConfig`
  - Returns agent configuration

#### Protected Methods

- `validateInput(input: TInput): Promise<boolean>`
  - Override to add custom input validation

- `shouldRetry(attemptNumber: number, error: Error, context: AgentContext): Promise<boolean>`
  - Override to customize retry logic

- `getRetryDelay(attemptNumber: number): number`
  - Calculates exponential backoff delay

### TaskManager

Database-backed task management.

#### Methods

- `createTask(agentType, userId, input, options?): Promise<AgentTask>`
  - Creates new task in database

- `getTask(taskId): Promise<AgentTask | undefined>`
  - Retrieves task by ID

- `updateTask(taskId, updates): Promise<AgentTask | undefined>`
  - Updates task fields

- `listTasks(userId, filters?): Promise<AgentTask[]>`
  - Lists tasks with optional filters

- `cancelTask(taskId): Promise<AgentTask | undefined>`
  - Cancels running task (sets status to 'paused')

- `startTask(taskId): Promise<AgentTask | undefined>`
  - Marks task as running

- `completeTask(taskId, output): Promise<AgentTask | undefined>`
  - Marks task as completed with output

- `failTask(taskId, error): Promise<AgentTask | undefined>`
  - Marks task as failed with error message

- `updateProgress(taskId, progress, step?, stepsCompleted?): Promise<void>`
  - Updates task progress

- `addCost(taskId, tokens, cost): Promise<void>`
  - Adds cost to task (atomic operation)

- `checkBudget(taskId): Promise<boolean>`
  - Checks if task is within budget

- `isCancelled(taskId): Promise<boolean>`
  - Checks if task is cancelled

- `getStats(userId): Promise<TaskStats>`
  - Gets task statistics for user

- `createContext(task): AgentContext`
  - Creates execution context with utilities

### Agent Registry

Singleton registry for agent management.

#### Methods

- `registerAgent(type, factory, config): void`
  - Registers an agent type

- `getAgent(type): BaseAgent`
  - Gets agent instance by type

- `hasAgent(type): boolean`
  - Checks if agent is registered

- `getAgentConfig(type): AgentConfig`
  - Gets agent configuration

- `listAgentTypes(): string[]`
  - Lists all registered agent types

- `listAllAgents(): Array<{ type, config }>`
  - Lists all agents with configs

## Types

### AgentStatus

```typescript
type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused';
```

### AgentTask

```typescript
interface AgentTask {
  id: string;
  agentType: string;
  userId: string;
  sessionId?: string;
  status: AgentStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  progress: number; // 0-100
  currentStep?: string;
  stepsCompleted: number;
  totalSteps: number;
  tokensUsed: number;
  totalCost: number; // in cents
  budgetLimit?: number; // in cents
  parentTaskId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}
```

### AgentConfig

```typescript
interface AgentConfig {
  name: string;
  description: string;
  version: string;
  maxBudget?: number; // in cents
  maxDuration?: number; // in ms
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}
```

### AgentContext

```typescript
interface AgentContext {
  task: AgentTask;
  userId: string;
  sessionId?: string;
  updateProgress: (progress: Partial<Pick<AgentTask, 'progress' | 'currentStep' | 'stepsCompleted'>>) => Promise<void>;
  addCost: (tokens: number, cost: number) => Promise<void>;
  checkBudget: () => Promise<boolean>;
  isCancelled: () => Promise<boolean>;
}
```

### AgentResult

```typescript
interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed: number;
  totalCost: number; // in cents
}
```

## Database Schema

### agent_tasks

Stores all agent task executions.

**Columns:**
- `id` (text, PK) - UUID
- `agent_type` (text) - Agent type identifier
- `user_id` (text, FK) - User who owns task
- `session_id` (text, nullable) - Optional chat session
- `status` (text) - Task status
- `input` (jsonb) - Task input data
- `output` (jsonb) - Task output data
- `error` (text) - Error message if failed
- `progress` (integer) - 0-100
- `current_step` (text) - Current step description
- `steps_completed` (integer) - Steps completed count
- `total_steps` (integer) - Total steps count
- `tokens_used` (integer) - AI tokens used
- `total_cost` (integer) - Total cost in cents
- `budget_limit` (integer) - Budget limit in cents
- `parent_task_id` (text, FK) - Parent task for sub-tasks
- `created_at`, `started_at`, `completed_at`, `updated_at` (timestamps)

**Indexes:**
- user_id, agent_type, status, session_id, parent_task_id, created_at

## Best Practices

### 1. Always Check Cancellation

```typescript
async execute(input, context) {
  if (await context.isCancelled()) {
    return { success: false, error: 'Cancelled', tokensUsed: 0, totalCost: 0 };
  }
  // ... rest of logic
}
```

### 2. Update Progress Regularly

```typescript
await context.updateProgress({
  progress: 25,
  currentStep: 'Fetching data',
  stepsCompleted: 1,
});
```

### 3. Track All Costs

```typescript
const result = await aiClient.chat(messages);
await context.addCost(result.usage.totalTokens, result.usage.cost);
```

### 4. Set Reasonable Budgets

```typescript
const task = await createTask('agent-type', userId, input, {
  budgetLimit: 50, // $0.50 maximum
  totalSteps: 5,
});
```

### 5. Use Lifecycle Hooks

```typescript
protected async onError(context: AgentContext, error: Error) {
  await super.onError(context, error);
  // Log to monitoring service
  await logger.error('Agent failed', { taskId: context.task.id, error });
}
```

### 6. Validate Input

```typescript
protected async validateInput(input: MyInput): Promise<boolean> {
  if (!input.query || input.query.trim().length === 0) {
    return false;
  }
  return true;
}
```

### 7. Handle Sub-Tasks

```typescript
// Create parent task
const parentTask = await createTask('parent-agent', userId, input);

// Create child task
const childTask = await createTask('child-agent', userId, childInput, {
  parentTaskId: parentTask.id,
});
```

## Examples

See `/docs/research-agent-usage-example.md` for comprehensive examples including:

- Basic agent implementation
- API endpoint integration
- Inngest event handling
- Task monitoring and management
- Error handling patterns

## Related Documentation

- [Research Agent Phase 1 Summary](/RESEARCH_AGENT_PHASE1_SUMMARY.md)
- [Database Schema](/src/lib/db/schema.ts)
- [Event Types](/src/lib/events/types.ts)
- [AI Client](/src/lib/ai/client.ts)

## Testing

```typescript
import { TaskManager } from '@/agents/base';

describe('TaskManager', () => {
  it('should create task', async () => {
    const task = await taskManager.createTask('test-agent', 'user-123', { query: 'test' });
    expect(task.id).toBeDefined();
    expect(task.status).toBe('pending');
  });

  it('should update progress', async () => {
    const task = await taskManager.createTask('test-agent', 'user-123', {});
    await taskManager.updateProgress(task.id, 50, 'Processing');

    const updated = await taskManager.getTask(task.id);
    expect(updated?.progress).toBe(50);
    expect(updated?.currentStep).toBe('Processing');
  });
});
```

## Migration from Legacy Code

If you have existing agent implementations, migrate them to use BaseAgent:

**Before:**
```typescript
class MyAgent {
  async process(input) {
    // Manual progress tracking
    // Manual cost tracking
    // No cancellation support
  }
}
```

**After:**
```typescript
class MyAgent extends BaseAgent<MyInput, MyOutput> {
  async execute(input, context) {
    // Automatic progress tracking via context
    // Automatic cost tracking via context
    // Built-in cancellation support
  }
}
```

## Performance Considerations

- **Database queries**: All task operations use indexed columns
- **Cost tracking**: Uses atomic SQL increment to prevent race conditions
- **Progress updates**: Debounce frequent updates (max 1/second recommended)
- **Long-running tasks**: Use Inngest for tasks > 60 seconds

## Security

- **User isolation**: Tasks are scoped to user_id
- **Budget enforcement**: Hard limits prevent runaway costs
- **Input validation**: Validate all user input before execution
- **Session linking**: Optional session_id for chat integration
