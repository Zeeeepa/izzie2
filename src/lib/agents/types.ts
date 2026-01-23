/**
 * Agent Framework Types
 * Types for the standardized long-running agent framework
 *
 * Part of the Standardized Long-Running Agent Framework (#92)
 */

/**
 * Agent cursor for incremental processing
 * Tracks position for resumable operations
 */
export interface AgentCursor {
  lastProcessedId?: string;
  lastProcessedDate?: Date;
  checkpoint?: Record<string, unknown>;
  updatedAt: Date;
}

/**
 * Agent execution context
 * Provides utilities for progress tracking, logging, and event emission
 */
export interface AgentContext {
  userId: string;
  runId: string;
  startedAt: Date;

  /**
   * Update task progress
   * @param percent - Progress percentage (0-100)
   * @param itemsProcessed - Number of items processed so far
   */
  trackProgress(percent: number, itemsProcessed?: number): Promise<void>;

  /**
   * Log a message with optional data
   * @param message - Log message
   * @param data - Optional additional data
   */
  log(message: string, data?: unknown): void;

  /**
   * Emit an Inngest event
   * @param event - Event name
   * @param data - Event data
   */
  emit(event: string, data: unknown): Promise<void>;
}

/**
 * Agent configuration
 * Defines scheduling, triggering, and execution constraints
 */
export interface AgentConfig {
  /** Cron expression for scheduled runs (e.g., '0 * * * *' for hourly) */
  schedule?: string;

  /** Inngest event name that triggers this agent */
  trigger?: string;

  /** Maximum concurrent executions (default: 1) */
  maxConcurrency?: number;

  /** Execution timeout in milliseconds (default: 5 minutes) */
  timeout?: number;

  /** Number of retry attempts on failure (default: 3) */
  retries?: number;
}

/**
 * Source types that agents can process
 */
export type AgentSource = 'email' | 'calendar' | 'tasks' | 'entities' | 'drive';

/**
 * Izzie Agent interface
 * Defines the contract for all background agents
 */
export interface IzzieAgent<TInput = unknown, TOutput = unknown> {
  /** Unique agent name identifier */
  name: string;

  /** Semantic version string */
  version: string;

  /** Human-readable description */
  description: string;

  /** Agent configuration */
  config: AgentConfig;

  /** Data sources this agent processes (for cursor tracking) */
  sources: AgentSource[];

  /**
   * Get cursor for a specific source
   * @param userId - User ID
   * @param source - Source type
   * @returns Cursor or null if not found
   */
  getCursor(userId: string, source: string): Promise<AgentCursor | null>;

  /**
   * Save cursor for a specific source
   * @param userId - User ID
   * @param source - Source type
   * @param cursor - Cursor data to save
   */
  saveCursor(userId: string, source: string, cursor: Partial<AgentCursor>): Promise<void>;

  /**
   * Core execution method
   * @param input - Agent input data
   * @param context - Execution context
   * @returns Agent output
   */
  execute(input: TInput, context: AgentContext): Promise<TOutput>;

  /**
   * Optional lifecycle hook: called when execution starts
   */
  onStart?(context: AgentContext): Promise<void>;

  /**
   * Optional lifecycle hook: called on progress updates
   */
  onProgress?(progress: number, context: AgentContext): Promise<void>;

  /**
   * Optional lifecycle hook: called on successful completion
   */
  onComplete?(output: TOutput, context: AgentContext): Promise<void>;

  /**
   * Optional lifecycle hook: called on execution error
   */
  onError?(error: Error, context: AgentContext): Promise<void>;
}

/**
 * Agent run result
 * Standard result format for agent execution
 */
export interface AgentRunResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  itemsProcessed: number;
  duration: number;
}

/**
 * Agent run status
 */
export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Agent input with userId (common pattern)
 */
export interface AgentInputWithUser {
  userId: string;
  [key: string]: unknown;
}

/**
 * Trigger agent options
 */
export interface TriggerAgentOptions {
  /** Delay before execution starts (in milliseconds) */
  delay?: number;

  /** Maximum number of retries */
  maxRetries?: number;
}
