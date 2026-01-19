# Research Agent Framework - Phase 1 Implementation Summary

## Overview
Successfully implemented Phase 1 (Foundation) of the Research Agent Framework for Izzie. This provides the base infrastructure that all agents will use for task management, progress tracking, cost monitoring, and lifecycle management.

## What Was Built

### 1. Base Agent Framework (`/src/agents/base/`)

Created a complete foundation for all agent implementations:

#### **types.ts** - Core Type Definitions
- `AgentStatus`: Task status tracking ('idle' | 'running' | 'completed' | 'failed' | 'paused')
- `AgentTask`: Full task record with progress, costs, and metadata
- `AgentConfig`: Agent configuration and constraints
- `AgentContext`: Runtime context with utility functions for agents
- `AgentResult`: Standard result format for all agents
- Research-specific types: `ResearchOptions`, `ResearchSource`, `ResearchFinding`

#### **agent.ts** - Base Agent Abstract Class
- Abstract base class that all agents extend
- Lifecycle hooks: `onStart()`, `onProgress()`, `onComplete()`, `onError()`
- `execute()` method that subclasses must implement
- `run()` wrapper with full lifecycle management
- Budget checking and cancellation support
- Retry logic with exponential backoff
- Proper error handling and reporting

#### **registry.ts** - Agent Registry
- Singleton registry for agent discovery
- `register()` - Register new agent types
- `get()` - Create agent instances by type
- `listTypes()` - List all registered agent types
- `listAll()` - Get all agents with configurations
- Factory pattern for agent instantiation

#### **task-manager.ts** - Task Management Utility
- Complete CRUD operations for agent tasks using Drizzle ORM
- `createTask()` - Create new tasks with options
- `getTask()` - Retrieve task by ID
- `updateTask()` - Update task fields
- `listTasks()` - Query tasks with filters
- `cancelTask()` - Cancel running tasks
- Progress tracking: `updateProgress()`, `addCost()`
- Budget management: `checkBudget()`, atomic cost updates
- Context creation: `createContext()` for agent execution
- Statistics: `getStats()` for user task analytics

#### **index.ts** - Clean Exports
- Single entry point for the base framework
- Exports all types, classes, and functions
- Convenient imports for agent implementations

### 2. Database Schema (`/src/lib/db/schema.ts`)

Added three new tables following PostgreSQL and Drizzle patterns:

#### **agent_tasks table**
```sql
- id: text (uuid, primary key)
- agent_type: text (not null)
- user_id: text (references users, not null)
- session_id: text (nullable, for chat integration)
- status: text (not null, default 'pending')
- input: jsonb (not null)
- output: jsonb (nullable)
- error: text (nullable)
- progress: integer (default 0)
- current_step: text (nullable)
- steps_completed: integer (default 0)
- total_steps: integer (default 0)
- tokens_used: integer (default 0)
- total_cost: integer (default 0) -- Cost in cents
- budget_limit: integer (nullable) -- Budget limit in cents
- parent_task_id: text (nullable, self-reference for sub-tasks)
- created_at: timestamp with time zone (default now())
- started_at: timestamp with time zone (nullable)
- completed_at: timestamp with time zone (nullable)
- updated_at: timestamp with time zone (default now())
```

**Indexes:**
- user_id, agent_type, status, session_id, parent_task_id, created_at

#### **research_sources table**
```sql
- id: text (uuid, primary key)
- task_id: text (references agent_tasks, not null)
- url: text (not null)
- title: text (nullable)
- content: text (nullable)
- content_type: text (nullable) -- html, pdf, etc.
- relevance_score: integer (nullable, 0-100)
- credibility_score: integer (nullable, 0-100)
- fetch_status: text (default 'pending') -- pending, fetched, failed
- fetch_error: text (nullable)
- fetched_at: timestamp with time zone (nullable)
- expires_at: timestamp with time zone (nullable) -- for cache TTL
- created_at: timestamp with time zone (default now())
```

**Indexes:**
- task_id, url, fetch_status, expires_at

#### **research_findings table**
```sql
- id: text (uuid, primary key)
- task_id: text (references agent_tasks, not null)
- source_id: text (references research_sources, nullable)
- claim: text (not null)
- evidence: text (nullable)
- confidence: integer (not null, 0-100)
- citation: text (nullable) -- formatted citation
- quote: text (nullable) -- direct quote from source
- embedding: vector(1536) (nullable) -- for semantic search
- created_at: timestamp with time zone (default now())
```

**Indexes:**
- task_id, source_id, confidence, created_at
- Vector index for semantic search (to be created via migration)

### 3. Event Types (`/src/lib/events/types.ts`)

Added comprehensive research agent events for Inngest:

#### Task Lifecycle Events
- `izzie/research.request` - Research task requested
- `izzie/research.started` - Task execution started
- `izzie/research.progress` - Progress update
- `izzie/research.completed` - Task completed successfully
- `izzie/research.failed` - Task failed with error

#### Sub-Task Events
- `izzie/research.search` - Search query execution
- `izzie/research.fetch` - Source URL fetching
- `izzie/research.analyze` - Source analysis
- `izzie/research.synthesize` - Findings synthesis

All events include Zod schemas for type safety and validation.

## Architecture Patterns

### Agent Lifecycle
```typescript
1. Create Task → taskManager.createTask()
2. Create Context → taskManager.createContext()
3. Execute Agent → agent.run(input, context)
   a. onStart() → Update status to 'running'
   b. execute() → Agent-specific logic
   c. checkBudget() → Verify cost limits
   d. onComplete() → Finalize and save output
   OR
   d. onError() → Handle and log errors
4. Update Task → taskManager.completeTask() or failTask()
```

### Cost Tracking
- Atomic cost updates via SQL increment (prevents race conditions)
- Per-task budget limits enforced
- Token counting for AI operations
- Total cost aggregation across all tasks

### Progress Tracking
- 0-100% progress scale
- Current step description
- Steps completed vs total steps
- Real-time updates via `context.updateProgress()`

### Cancellation Support
- Tasks can be cancelled via `taskManager.cancelTask()`
- Sets status to 'paused'
- Agents check `context.isCancelled()` during execution
- Graceful shutdown of long-running operations

## Integration Points

### With Existing Systems
✅ **Database**: Uses existing Neon Postgres + Drizzle ORM patterns
✅ **AI**: Compatible with existing OpenRouter client at `/src/lib/ai/`
✅ **Events**: Extends existing Inngest event types
✅ **Auth**: Links tasks to users via user_id foreign key
✅ **Chat**: Optional session_id for chat integration

### With Future Phases
🔄 **Phase 2**: Research agent will extend `BaseAgent` class
🔄 **Phase 3**: Web scraping will populate `research_sources`
🔄 **Phase 4**: LLM analysis will create `research_findings`
🔄 **Phase 5**: Inngest functions will emit research events

## File Structure
```
/src/agents/base/
  ├── types.ts          # Type definitions
  ├── agent.ts          # Base agent class
  ├── registry.ts       # Agent registry
  ├── task-manager.ts   # Task CRUD operations
  └── index.ts          # Exports

/src/lib/db/
  └── schema.ts         # Added 3 new tables + types

/src/lib/events/
  └── types.ts          # Added 9 research events
```

## Usage Example

```typescript
import { BaseAgent, createTask, taskManager } from '@/agents/base';

// 1. Define a custom agent
class MyAgent extends BaseAgent<MyInput, MyOutput> {
  constructor() {
    super({
      name: 'My Agent',
      description: 'Does something useful',
      version: '1.0.0',
      maxBudget: 100, // $1.00 limit
      maxDuration: 60000, // 60 seconds
    });
  }

  async execute(input: MyInput, context: AgentContext): Promise<AgentResult<MyOutput>> {
    // Check cancellation
    if (await context.isCancelled()) {
      return { success: false, error: 'Cancelled', tokensUsed: 0, totalCost: 0 };
    }

    // Update progress
    await context.updateProgress({ progress: 25, currentStep: 'Processing input' });

    // Do work...
    const result = await doWork(input);

    // Track costs
    await context.addCost(1000, 5); // 1000 tokens, 5 cents

    // Update progress
    await context.updateProgress({ progress: 100, currentStep: 'Done' });

    return {
      success: true,
      data: result,
      tokensUsed: 1000,
      totalCost: 5,
    };
  }
}

// 2. Register the agent
registerAgent('my-agent', () => new MyAgent(), myAgent.getConfig());

// 3. Create and run a task
const task = await createTask('my-agent', userId, { query: 'test' });
const context = taskManager.createContext(task);
const agent = getAgent('my-agent');
const result = await agent.run(input, context);
```

## Next Steps (Phase 2)

1. **Create Research Agent** (`/src/agents/research/`)
   - Extend `BaseAgent<ResearchInput, ResearchOutput>`
   - Implement search, fetch, analyze, synthesize steps
   - Use AI client for analysis

2. **Web Scraping Service** (`/src/lib/scraping/`)
   - URL fetching and parsing
   - Content extraction (HTML, PDF, etc.)
   - Credibility scoring

3. **Inngest Functions** (`/src/lib/events/functions/research/`)
   - Handle research events
   - Orchestrate multi-step workflows
   - Emit progress events

4. **API Endpoints** (`/src/app/api/agents/research/`)
   - POST /api/agents/research - Create research task
   - GET /api/agents/research/:id - Get task status
   - DELETE /api/agents/research/:id - Cancel task

## Success Criteria ✅

- [x] Base agent framework created
- [x] Database tables defined with proper indexes
- [x] Event types added with Zod schemas
- [x] Task manager with full CRUD operations
- [x] Agent registry for discovery
- [x] Type safety throughout (TypeScript strict mode)
- [x] Follows existing code patterns (Drizzle, Inngest, etc.)
- [x] Cost tracking and budget enforcement
- [x] Progress tracking and cancellation support
- [x] Proper error handling and logging

## LOC Delta

**Added:**
- `/src/agents/base/types.ts`: ~125 lines
- `/src/agents/base/agent.ts`: ~188 lines
- `/src/agents/base/registry.ts`: ~158 lines
- `/src/agents/base/task-manager.ts`: ~415 lines
- `/src/agents/base/index.ts`: ~45 lines
- `/src/lib/db/schema.ts`: ~145 lines (new tables)
- `/src/lib/events/types.ts`: ~140 lines (new events)

**Total Added**: ~1,216 lines
**Total Removed**: 0 lines
**Net Change**: +1,216 lines

This is a greenfield implementation providing essential infrastructure for all future agents.
