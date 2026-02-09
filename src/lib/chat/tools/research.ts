/**
 * Research Chat Tool
 * Enables users to conduct research across web, email, and Google Drive sources
 */

import { z } from 'zod';
import { createTask, getTask } from '@/agents/base/task-manager';
import { inngest } from '@/lib/events';
import {
  formatResearchResults,
  formatResearchStatus,
  formatResearchError,
} from '../formatters/research';
import type { ResearchOutput } from '@/agents/research/types';

/**
 * Valid research sources
 */
export const ResearchSource = {
  WEB: 'web',
  EMAIL: 'email',
  DRIVE: 'drive',
} as const;

export type ResearchSourceType = (typeof ResearchSource)[keyof typeof ResearchSource];

/**
 * Progress update callback type for streaming progress to client
 */
export type ProgressCallback = (progress: {
  step: string;
  progress: number;
  status: string;
}) => void;

/**
 * Research tool parameter schema
 */
export const researchToolSchema = z.object({
  query: z.string().describe('The research question or topic to investigate'),
  context: z
    .string()
    .optional()
    .describe('Additional context about what to focus on or prioritize'),
  maxSources: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum number of sources to analyze (1-10)'),
  sources: z
    .array(z.enum(['web', 'email', 'drive']))
    .optional()
    .default(['web', 'email', 'drive'])
    .describe('Sources to search: web (internet), email (Gmail), drive (Google Drive). Defaults to all sources.'),
});

export type ResearchToolParams = z.infer<typeof researchToolSchema>;

/**
 * Research tool definition for chat integration
 */
export const researchTool = {
  name: 'research',
  description:
    'Conduct comprehensive research across web, email, and Google Drive sources. Use this when the user asks for in-depth research, analysis of multiple sources, or needs information on a complex topic. By default searches all sources (web, email, drive), but can be limited to specific sources (e.g., "research my emails about project X" would use sources: ["email"]). Analyzes multiple sources, extracts key findings, and provides a well-structured summary with citations.',
  parameters: researchToolSchema,

  /**
   * Execute research task with optional progress callback for SSE streaming
   * @param params - Tool parameters
   * @param userId - User ID who initiated the research
   * @param onProgress - Optional callback for streaming progress updates
   * @returns Status message with task ID for tracking
   */
  async execute(
    params: ResearchToolParams,
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ message: string; taskId: string }> {
    try {
      // Validate parameters
      const validated = researchToolSchema.parse(params);

      // Create research task in database
      const task = await createTask('research', userId, validated, {
        totalSteps: 5, // Plan, Search, Analyze, Synthesize, Complete
      });

      console.log(`[Research Tool] Created task ${task.id} for user ${userId}`);

      // Send initial progress if callback provided
      onProgress?.({
        step: 'Initializing research agent...',
        progress: 0,
        status: 'starting',
      });

      // Send Inngest event to start research in background
      await inngest.send({
        name: 'izzie/research.request',
        data: {
          taskId: task.id,
          userId,
          query: validated.query,
          context: validated.context,
          maxSources: validated.maxSources,
          maxDepth: 1,
          sources: validated.sources,
        },
      });

      console.log(`[Research Tool] Started research task ${task.id}`);

      onProgress?.({
        step: 'Research task queued',
        progress: 5,
        status: 'queued',
      });

      // Poll for task completion
      // Vercel has a 60s timeout, so we'll poll for up to 55 seconds
      const MAX_WAIT_MS = 55000; // 55 seconds max wait
      const POLL_INTERVAL_MS = 1500; // Check every 1.5 seconds (faster feedback)
      const startTime = Date.now();
      let lastProgress = 5;
      let lastStep = 'Waiting for task to start';

      console.log(`[Research Tool] Polling for task ${task.id} completion (max ${MAX_WAIT_MS / 1000}s)`);

      while (Date.now() - startTime < MAX_WAIT_MS) {
        // Wait before checking (shorter initial delay)
        const waitTime = Date.now() - startTime < 1500 ? 500 : POLL_INTERVAL_MS;
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Check task status
        const updatedTask = await getTask(task.id);

        if (!updatedTask) {
          console.error(`[Research Tool] Task ${task.id} not found during polling`);
          break;
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[Research Tool] Task ${task.id} status: ${updatedTask.status}, progress: ${updatedTask.progress}%, step: ${updatedTask.currentStep} (${elapsedSec}s elapsed)`
        );

        // Send progress update if changed
        const currentStep = updatedTask.currentStep || 'Processing';
        const currentProgress = updatedTask.progress || 0;

        if (currentProgress !== lastProgress || currentStep !== lastStep) {
          lastProgress = currentProgress;
          lastStep = currentStep;

          onProgress?.({
            step: currentStep,
            progress: currentProgress,
            status: updatedTask.status,
          });
        }

        if (updatedTask.status === 'completed') {
          // Research completed - check for output
          const output = updatedTask.output as unknown as ResearchOutput;

          console.log(`[Research Tool] Task ${task.id} completed after ${elapsedSec}s, output present: ${!!output}`);

          if (output) {
            const formattedResults = formatResearchResults(output);

            onProgress?.({
              step: 'Research complete',
              progress: 100,
              status: 'completed',
            });

            return {
              message: `${formatResearchStatus(updatedTask)}\n\n${formattedResults}`,
              taskId: task.id,
            };
          } else {
            // Completed but no output - this is the bug case
            console.warn(`[Research Tool] Task ${task.id} completed but output is null/undefined`);

            // Wait a moment and try one more fetch in case of race condition
            await new Promise((resolve) => setTimeout(resolve, 500));
            const retryTask = await getTask(task.id);

            if (retryTask?.output) {
              const retryOutput = retryTask.output as unknown as ResearchOutput;
              const formattedResults = formatResearchResults(retryOutput);

              onProgress?.({
                step: 'Research complete',
                progress: 100,
                status: 'completed',
              });

              return {
                message: `${formatResearchStatus(retryTask)}\n\n${formattedResults}`,
                taskId: task.id,
              };
            }

            // Still no output - return error
            return {
              message: formatResearchError('Research completed but no results were returned. This may be a temporary issue - please try again.'),
              taskId: task.id,
            };
          }
        } else if (updatedTask.status === 'failed') {
          // Research failed - return error
          const errorMsg = formatResearchError(
            updatedTask.error || 'Research failed unexpectedly'
          );

          console.log(`[Research Tool] Task ${task.id} failed after ${elapsedSec}s: ${updatedTask.error}`);

          onProgress?.({
            step: 'Research failed',
            progress: currentProgress,
            status: 'failed',
          });

          return {
            message: errorMsg,
            taskId: task.id,
          };
        }

        // Task still running - continue polling
      }

      // Timeout - task is still running after MAX_WAIT_MS
      // Return a message indicating the research is still in progress
      const finalTask = await getTask(task.id);
      const statusMsg = finalTask
        ? formatResearchStatus(finalTask)
        : formatResearchStatus({
            id: task.id,
            status: 'running',
            progress: lastProgress,
            currentStep: lastStep,
          });

      const sourcesStr = validated.sources?.join(', ') || 'web, email, drive';

      console.log(`[Research Tool] Task ${task.id} timed out after ${MAX_WAIT_MS / 1000}s, still running at ${lastProgress}%`);

      onProgress?.({
        step: 'Research still in progress (timeout)',
        progress: lastProgress,
        status: 'timeout',
      });

      return {
        message: `${statusMsg}\n\n**Research is taking longer than expected.**\n\nI'm still researching "${validated.query}" across ${sourcesStr}. This complex query requires additional processing time.\n\nYou can check the results later by asking: "What's the status of my research?"\n\n*Task ID: ${task.id}*`,
        taskId: task.id,
      };
    } catch (error) {
      console.error('[Research Tool] Failed to execute:', error);

      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid research parameters: ${error.issues.map((e) => e.message).join(', ')}`
        );
      }

      throw new Error(
        `Failed to start research: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Check research status tool
 * Allows users to check the status of a running research task
 */
export const checkResearchStatusTool = {
  name: 'check_research_status',
  description:
    'Check the status of a research task. Use this when the user asks about research progress or wants to see results of a previously started research task.',
  parameters: z.object({
    taskId: z.string().describe('The research task ID to check'),
  }),

  async execute(
    params: { taskId: string },
    userId: string
  ): Promise<{ message: string }> {
    try {
      const task = await getTask(params.taskId);

      if (!task) {
        return {
          message: `❌ Research task ${params.taskId} not found.`,
        };
      }

      // Verify task belongs to user
      if (task.userId !== userId) {
        return {
          message: '❌ Unauthorized: This research task does not belong to you.',
        };
      }

      // Check task status
      if (task.status === 'completed' && task.output) {
        const output = task.output as unknown as ResearchOutput;
        const formattedResults = formatResearchResults(output);
        return {
          message: `${formatResearchStatus(task)}\n\n${formattedResults}`,
        };
      } else if (task.status === 'failed') {
        const errorMsg = formatResearchError(
          task.error || 'Research failed unexpectedly'
        );
        return {
          message: errorMsg,
        };
      } else {
        // Still running or paused
        const statusMsg = formatResearchStatus(task);
        return {
          message: statusMsg,
        };
      }
    } catch (error) {
      console.error('[Check Research Status Tool] Failed:', error);
      throw new Error(
        `Failed to check research status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
