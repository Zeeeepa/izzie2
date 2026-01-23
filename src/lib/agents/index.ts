/**
 * Agent Framework Index
 * Central exports for the standardized long-running agent framework
 *
 * Part of the Standardized Long-Running Agent Framework (#92)
 */

// Types
export type {
  AgentCursor,
  AgentContext,
  AgentConfig,
  AgentSource,
  IzzieAgent,
  AgentRunResult,
  AgentRunStatus,
  AgentInputWithUser,
  TriggerAgentOptions,
} from './types';

// Framework
export {
  BaseAgent,
  createAgentFunction,
  triggerAgent,
  getAgentRuns,
  getAgentRun,
  cleanupAgentRuns,
} from './framework';

// Registry
export {
  agentRegistry,
  AgentRegistry,
  registerAgent,
  getAgent,
  listAgents,
  type RegisteredAgent,
} from './registry';
