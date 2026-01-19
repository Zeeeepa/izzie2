/**
 * Base Agent Framework
 * Foundation for all agent implementations in Izzie
 *
 * Exports:
 * - Types: Core type definitions
 * - BaseAgent: Abstract base class for agents
 * - Registry: Agent registration and discovery
 * - TaskManager: Task CRUD operations
 */

// Types
export type {
  AgentStatus,
  AgentTask,
  AgentConfig,
  AgentContext,
  AgentResult,
  ResearchOptions,
  ResearchSource,
  ResearchFinding,
} from './types';

// Base Agent class
export { BaseAgent } from './agent';

// Registry
export {
  default as agentRegistry,
  registerAgent,
  getAgent,
  hasAgent,
  getAgentConfig,
  listAgentTypes,
  listAllAgents,
} from './registry';

// Task Manager
export {
  default as taskManager,
  TaskManager,
  createTask,
  getTask,
  updateTask,
  listTasks,
  cancelTask,
  getTaskStats,
  type TaskFilters,
  type CreateTaskOptions,
} from './task-manager';
