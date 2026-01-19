/**
 * Chat System Type Definitions
 * Types specific to the chat system (separate from core types in /src/types)
 */

import type { ResearchOutput } from '@/agents/research/types';

/**
 * Research tool result interface
 * Returned when research tool is executed in chat
 */
export interface ResearchToolResult {
  /** Task ID for tracking research progress */
  taskId: string;

  /** Current status of research task */
  status: 'started' | 'running' | 'completed' | 'failed' | 'paused';

  /** Progress percentage (0-100) */
  progress?: number;

  /** Current step description */
  currentStep?: string;

  /** Research summary (when completed) */
  summary?: string;

  /** Number of findings extracted (when completed) */
  findingsCount?: number;

  /** Number of sources analyzed (when completed) */
  sourcesCount?: number;

  /** Full research output (when completed) */
  output?: ResearchOutput;

  /** Error message (when failed) */
  error?: string;

  /** Cost in dollars */
  totalCost?: number;

  /** Tokens used */
  tokensUsed?: number;
}

/**
 * Tool execution status
 * Sent via SSE during chat streaming
 */
export interface ToolExecutionEvent {
  type: 'tool_execution';
  tool: string;
  status: 'executing' | 'completed' | 'failed';
}

/**
 * Tool result event
 * Sent via SSE after tool completes
 */
export interface ToolResultEvent {
  type: 'tool_result';
  tool: string;
  success: boolean;
  result?: unknown;
}

/**
 * Chat metadata event
 * Sent at end of streaming
 */
export interface ChatMetadataEvent {
  type: 'metadata';
  sessionId: string;
  title?: string;
  messageCount: number;
  hasCurrentTask: boolean;
  compressionActive: boolean;
}

/**
 * Chat SSE event types
 * Union of all possible SSE events during chat
 */
export type ChatStreamEvent =
  | { type: 'content'; delta: string; content: string; done: boolean }
  | ToolExecutionEvent
  | ToolResultEvent
  | ChatMetadataEvent
  | { type: 'error'; error: string };
