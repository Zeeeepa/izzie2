/**
 * Base Agent Abstract Class
 * All agents extend this class to inherit common functionality
 */

import type {
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentTask,
} from './types';

/**
 * Abstract base class for all agents
 * Provides lifecycle hooks and utility methods
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Main execution method - must be implemented by subclasses
   */
  abstract execute(
    input: TInput,
    context: AgentContext
  ): Promise<AgentResult<TOutput>>;

  /**
   * Lifecycle hook: called before execution starts
   * Override to add initialization logic
   */
  protected async onStart(context: AgentContext): Promise<void> {
    console.log(`[${this.config.name}] Starting task ${context.task.id}`);
    await context.updateProgress({
      progress: 0,
      currentStep: 'Initializing',
      stepsCompleted: 0,
    });
  }

  /**
   * Lifecycle hook: called when progress updates
   * Override to add custom progress tracking
   */
  protected async onProgress(
    context: AgentContext,
    step: string,
    progress: number
  ): Promise<void> {
    console.log(`[${this.config.name}] ${step} (${progress}%)`);
    await context.updateProgress({
      progress,
      currentStep: step,
      stepsCompleted: Math.floor((progress / 100) * context.task.totalSteps),
    });
  }

  /**
   * Lifecycle hook: called when execution completes successfully
   * Override to add cleanup or finalization logic
   */
  protected async onComplete(
    context: AgentContext,
    result: AgentResult<TOutput>
  ): Promise<void> {
    console.log(`[${this.config.name}] Completed task ${context.task.id}`);
    await context.updateProgress({
      progress: 100,
      currentStep: 'Completed',
      stepsCompleted: context.task.totalSteps,
    });
  }

  /**
   * Lifecycle hook: called when execution fails
   * Override to add error handling or recovery logic
   */
  protected async onError(context: AgentContext, error: Error): Promise<void> {
    console.error(
      `[${this.config.name}] Task ${context.task.id} failed:`,
      error
    );
  }

  /**
   * Run the agent with full lifecycle management
   * This wraps the execute() method with hooks and error handling
   */
  async run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>> {
    try {
      // Check if task is cancelled before starting
      if (await context.isCancelled()) {
        return {
          success: false,
          error: 'Task was cancelled before execution',
          tokensUsed: 0,
          totalCost: 0,
        };
      }

      // Call onStart hook
      await this.onStart(context);

      // Execute the agent logic
      const result = await this.execute(input, context);

      // Check budget after execution
      const budgetOk = await context.checkBudget();
      if (!budgetOk) {
        return {
          success: false,
          error: 'Budget limit exceeded',
          tokensUsed: context.task.tokensUsed,
          totalCost: context.task.totalCost,
        };
      }

      // Call onComplete hook
      await this.onComplete(context, result);

      return result;
    } catch (error) {
      // Call onError hook
      await this.onError(context, error as Error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: context.task.tokensUsed,
        totalCost: context.task.totalCost,
      };
    }
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Validate input data
   * Override to add custom validation logic
   */
  protected async validateInput(input: TInput): Promise<boolean> {
    return input !== null && input !== undefined;
  }

  /**
   * Check if agent should retry after failure
   * Override to add custom retry logic
   */
  protected async shouldRetry(
    attemptNumber: number,
    error: Error,
    context: AgentContext
  ): Promise<boolean> {
    const retryConfig = this.config.retryConfig;
    if (!retryConfig) {
      return false;
    }

    // Don't retry if budget exceeded
    const budgetOk = await context.checkBudget();
    if (!budgetOk) {
      return false;
    }

    // Don't retry if cancelled
    const cancelled = await context.isCancelled();
    if (cancelled) {
      return false;
    }

    return attemptNumber < retryConfig.maxRetries;
  }

  /**
   * Calculate backoff delay for retry
   */
  protected getRetryDelay(attemptNumber: number): number {
    const baseDelay = this.config.retryConfig?.backoffMs || 1000;
    return baseDelay * Math.pow(2, attemptNumber - 1); // Exponential backoff
  }
}
