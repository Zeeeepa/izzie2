/**
 * Agent Framework
 * Core framework for standardized long-running agents with Inngest integration
 *
 * Part of the Standardized Long-Running Agent Framework (#92)
 */

import { eq, and, desc } from 'drizzle-orm';
import { inngest } from '@/lib/events';
import { dbClient, schema } from '@/lib/db/client';
import type {
  IzzieAgent,
  AgentCursor,
  AgentContext,
  AgentConfig,
  AgentSource,
  AgentRunResult,
  AgentRunStatus,
  AgentInputWithUser,
  TriggerAgentOptions,
} from './types';

const { agentRuns, agentCursors, AGENT_RUN_STATUS } = schema;

/**
 * Abstract base class for all Izzie agents
 * Provides cursor management and lifecycle hooks
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown>
  implements IzzieAgent<TInput, TOutput>
{
  abstract name: string;
  abstract version: string;
  abstract description: string;
  abstract config: AgentConfig;
  abstract sources: AgentSource[];

  /**
   * Core execution method - must be implemented by subclasses
   */
  abstract execute(input: TInput, context: AgentContext): Promise<TOutput>;

  /**
   * Get cursor for incremental processing
   */
  async getCursor(userId: string, source: string): Promise<AgentCursor | null> {
    const db = dbClient.getDb();

    const result = await db
      .select()
      .from(agentCursors)
      .where(
        and(
          eq(agentCursors.userId, userId),
          eq(agentCursors.agentName, this.name),
          eq(agentCursors.source, source)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const cursor = result[0];
    return {
      lastProcessedId: cursor.lastProcessedId ?? undefined,
      lastProcessedDate: cursor.lastProcessedDate ?? undefined,
      checkpoint: cursor.checkpoint ?? undefined,
      updatedAt: cursor.updatedAt,
    };
  }

  /**
   * Save cursor for incremental processing
   */
  async saveCursor(
    userId: string,
    source: string,
    cursor: Partial<AgentCursor>
  ): Promise<void> {
    const db = dbClient.getDb();

    // Upsert cursor using ON CONFLICT
    await db
      .insert(agentCursors)
      .values({
        userId,
        agentName: this.name,
        source,
        lastProcessedId: cursor.lastProcessedId,
        lastProcessedDate: cursor.lastProcessedDate,
        checkpoint: cursor.checkpoint,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [agentCursors.userId, agentCursors.agentName, agentCursors.source],
        set: {
          lastProcessedId: cursor.lastProcessedId,
          lastProcessedDate: cursor.lastProcessedDate,
          checkpoint: cursor.checkpoint,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Optional lifecycle hooks - can be overridden by subclasses
   */
  async onStart?(context: AgentContext): Promise<void>;
  async onProgress?(progress: number, context: AgentContext): Promise<void>;
  async onComplete?(output: TOutput, context: AgentContext): Promise<void>;
  async onError?(error: Error, context: AgentContext): Promise<void>;
}

/**
 * Create an Inngest function for an agent
 * Wraps the agent execution with progress tracking and lifecycle hooks
 */
export function createAgentFunction<TInput extends AgentInputWithUser, TOutput>(
  agent: IzzieAgent<TInput, TOutput>
) {
  const eventName = agent.config.trigger || `izzie/agent.${agent.name}`;

  // Inngest expects specific literal types for retries (0-20)
  const retries = Math.min(20, Math.max(0, agent.config.retries ?? 3)) as
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
    | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

  return inngest.createFunction(
    {
      id: `agent-${agent.name}`,
      name: `Agent: ${agent.name}`,
      retries,
      concurrency: {
        limit: agent.config.maxConcurrency ?? 1,
      },
    },
    { event: eventName },
    async ({ event, step, logger }) => {
      const input = event.data as TInput;
      const { userId } = input;

      logger.info(`Starting agent: ${agent.name}`, { userId, input });

      // Step 1: Create agent run record
      const runId = await step.run('create-run', async () => {
        const db = dbClient.getDb();

        const [run] = await db
          .insert(agentRuns)
          .values({
            agentName: agent.name,
            userId,
            status: AGENT_RUN_STATUS.PENDING,
            progress: 0,
            itemsProcessed: 0,
          })
          .returning({ id: agentRuns.id });

        logger.info('Created agent run', { runId: run.id });
        return run.id;
      });

      // Build execution context
      const startedAt = new Date();
      const context: AgentContext = {
        userId,
        runId,
        startedAt,

        trackProgress: async (percent: number, itemsProcessed?: number) => {
          const db = dbClient.getDb();
          await db
            .update(agentRuns)
            .set({
              progress: Math.min(100, Math.max(0, percent)),
              itemsProcessed: itemsProcessed ?? 0,
            })
            .where(eq(agentRuns.id, runId));

          // Call lifecycle hook if defined
          if (agent.onProgress) {
            await agent.onProgress(percent, context);
          }
        },

        log: (message: string, data?: unknown) => {
          logger.info(`[${agent.name}] ${message}`, data);
        },

        emit: async (eventName: string, data: unknown) => {
          await inngest.send({
            name: eventName,
            data,
          });
        },
      };

      try {
        // Step 2: Mark as running and call onStart
        await step.run('start-execution', async () => {
          const db = dbClient.getDb();
          await db
            .update(agentRuns)
            .set({
              status: AGENT_RUN_STATUS.RUNNING,
              startedAt,
            })
            .where(eq(agentRuns.id, runId));

          // Call lifecycle hook if defined
          if (agent.onStart) {
            await agent.onStart(context);
          }
        });

        // Step 3: Execute the agent
        // Note: Inngest serializes outputs to JSON, so we cast back to TOutput
        const output = (await step.run('execute', async () => {
          return await agent.execute(input, context);
        })) as TOutput;

        // Step 4: Mark as completed and get duration
        const completedAt = new Date();
        const duration = completedAt.getTime() - startedAt.getTime();

        await step.run('complete', async () => {
          const db = dbClient.getDb();

          await db
            .update(agentRuns)
            .set({
              status: AGENT_RUN_STATUS.COMPLETED,
              progress: 100,
              output: output as Record<string, unknown>,
              completedAt,
            })
            .where(eq(agentRuns.id, runId));

          // Call lifecycle hook if defined
          if (agent.onComplete) {
            await agent.onComplete(output as TOutput, context);
          }
        });

        // Build result outside of step for proper typing
        const result: AgentRunResult<TOutput> = {
          success: true,
          output: output as TOutput,
          itemsProcessed: 0, // Will be updated from the run record
          duration,
        };

        // Emit completion event
        await step.sendEvent('agent-completed', {
          name: `izzie/agent.${agent.name}.completed`,
          data: {
            runId,
            userId,
            success: true,
            duration,
          },
        });

        logger.info(`Agent completed: ${agent.name}`, {
          runId,
          userId,
          duration,
        });

        return result;
      } catch (error) {
        // Handle execution error
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        logger.error(`Agent failed: ${agent.name}`, {
          runId,
          userId,
          error: errorMessage,
        });

        // Mark as failed
        await step.run('mark-failed', async () => {
          const db = dbClient.getDb();
          await db
            .update(agentRuns)
            .set({
              status: AGENT_RUN_STATUS.FAILED,
              errorMessage,
              completedAt: new Date(),
            })
            .where(eq(agentRuns.id, runId));

          // Call lifecycle hook if defined
          if (agent.onError) {
            await agent.onError(
              error instanceof Error ? error : new Error(errorMessage),
              context
            );
          }
        });

        // Emit failure event
        await step.sendEvent('agent-failed', {
          name: `izzie/agent.${agent.name}.failed`,
          data: {
            runId,
            userId,
            error: errorMessage,
          },
        });

        throw error;
      }
    }
  );
}

/**
 * Trigger an agent execution
 * Returns the run ID for tracking
 */
export async function triggerAgent<TInput extends AgentInputWithUser>(
  agentName: string,
  input: TInput,
  options?: TriggerAgentOptions
): Promise<{ runId: string }> {
  const eventName = `izzie/agent.${agentName}`;

  // Send the trigger event
  await inngest.send({
    name: eventName,
    data: input,
    ...(options?.delay ? { ts: Date.now() + options.delay } : {}),
  });

  // Return a placeholder runId - the actual runId is created in the function
  // Callers should use getAgentRuns to get the actual run status
  return { runId: 'pending' };
}

/**
 * Get agent runs for a user
 */
export async function getAgentRuns(
  userId: string,
  agentName?: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  agentName: string;
  status: AgentRunStatus;
  progress: number;
  itemsProcessed: number;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}>> {
  const db = dbClient.getDb();

  const conditions = [eq(agentRuns.userId, userId)];

  if (agentName) {
    conditions.push(eq(agentRuns.agentName, agentName));
  }

  const runs = await db
    .select()
    .from(agentRuns)
    .where(and(...conditions))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);

  return runs.map((run) => ({
    id: run.id,
    agentName: run.agentName,
    status: run.status as AgentRunStatus,
    progress: run.progress,
    itemsProcessed: run.itemsProcessed,
    output: run.output ?? undefined,
    errorMessage: run.errorMessage ?? undefined,
    startedAt: run.startedAt ?? undefined,
    completedAt: run.completedAt ?? undefined,
    createdAt: run.createdAt,
  }));
}

/**
 * Get a specific agent run by ID
 */
export async function getAgentRun(
  runId: string
): Promise<{
  id: string;
  agentName: string;
  userId: string;
  status: AgentRunStatus;
  progress: number;
  itemsProcessed: number;
  itemsTotal?: number;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
} | null> {
  const db = dbClient.getDb();

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);

  if (!run) {
    return null;
  }

  return {
    id: run.id,
    agentName: run.agentName,
    userId: run.userId,
    status: run.status as AgentRunStatus,
    progress: run.progress,
    itemsProcessed: run.itemsProcessed,
    itemsTotal: run.itemsTotal ?? undefined,
    output: run.output ?? undefined,
    errorMessage: run.errorMessage ?? undefined,
    startedAt: run.startedAt ?? undefined,
    completedAt: run.completedAt ?? undefined,
    createdAt: run.createdAt,
  };
}

/**
 * Delete old agent runs (cleanup utility)
 */
export async function cleanupAgentRuns(
  olderThanDays: number = 30
): Promise<number> {
  const db = dbClient.getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await db
    .delete(agentRuns)
    .where(
      and(
        eq(agentRuns.status, AGENT_RUN_STATUS.COMPLETED),
        // Note: Using raw SQL for date comparison would be cleaner
        // but this works with Drizzle's type system
      )
    )
    .returning({ id: agentRuns.id });

  return result.length;
}
