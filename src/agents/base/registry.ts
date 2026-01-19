/**
 * Agent Registry
 * Central registry for all available agents in the system
 */

import type { BaseAgent } from './agent';
import type { AgentConfig } from './types';

/**
 * Registered agent entry
 */
interface RegisteredAgent {
  type: string;
  factory: () => BaseAgent<any, any>;
  config: AgentConfig;
}

/**
 * Agent Registry Class
 * Singleton pattern for managing agent registration and discovery
 */
class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();

  /**
   * Register an agent type
   * @param type - Unique identifier for the agent type (e.g., 'research', 'classifier')
   * @param factory - Factory function that creates a new instance of the agent
   * @param config - Agent configuration
   */
  register(
    type: string,
    factory: () => BaseAgent<any, any>,
    config: AgentConfig
  ): void {
    if (this.agents.has(type)) {
      console.warn(`[AgentRegistry] Agent type '${type}' is already registered. Overwriting.`);
    }

    this.agents.set(type, { type, factory, config });
    console.log(`[AgentRegistry] Registered agent: ${type} (${config.name} v${config.version})`);
  }

  /**
   * Unregister an agent type
   * @param type - Agent type to unregister
   */
  unregister(type: string): boolean {
    const result = this.agents.delete(type);
    if (result) {
      console.log(`[AgentRegistry] Unregistered agent: ${type}`);
    }
    return result;
  }

  /**
   * Get an agent instance by type
   * @param type - Agent type identifier
   * @returns New instance of the agent
   * @throws Error if agent type is not registered
   */
  get(type: string): BaseAgent<any, any> {
    const registered = this.agents.get(type);

    if (!registered) {
      throw new Error(
        `Agent type '${type}' is not registered. Available types: ${Array.from(this.agents.keys()).join(', ')}`
      );
    }

    return registered.factory();
  }

  /**
   * Check if an agent type is registered
   * @param type - Agent type identifier
   */
  has(type: string): boolean {
    return this.agents.has(type);
  }

  /**
   * Get agent configuration by type
   * @param type - Agent type identifier
   * @returns Agent configuration
   * @throws Error if agent type is not registered
   */
  getConfig(type: string): AgentConfig {
    const registered = this.agents.get(type);

    if (!registered) {
      throw new Error(`Agent type '${type}' is not registered`);
    }

    return registered.config;
  }

  /**
   * List all registered agent types
   * @returns Array of agent type identifiers
   */
  listTypes(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * List all registered agents with their configurations
   * @returns Array of agent metadata
   */
  listAll(): Array<{ type: string; config: AgentConfig }> {
    return Array.from(this.agents.values()).map(({ type, config }) => ({
      type,
      config,
    }));
  }

  /**
   * Clear all registered agents
   * Useful for testing or reinitialization
   */
  clear(): void {
    this.agents.clear();
    console.log('[AgentRegistry] All agents cleared');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    agentTypes: string[];
  } {
    return {
      totalAgents: this.agents.size,
      agentTypes: this.listTypes(),
    };
  }
}

/**
 * Singleton instance of the agent registry
 */
const registry = new AgentRegistry();

/**
 * Export registry instance as default
 */
export default registry;

/**
 * Convenience functions for working with the registry
 */

/**
 * Register an agent
 */
export function registerAgent(
  type: string,
  factory: () => BaseAgent<any, any>,
  config: AgentConfig
): void {
  registry.register(type, factory, config);
}

/**
 * Get an agent instance
 */
export function getAgent(type: string): BaseAgent<any, any> {
  return registry.get(type);
}

/**
 * Check if agent is registered
 */
export function hasAgent(type: string): boolean {
  return registry.has(type);
}

/**
 * Get agent configuration
 */
export function getAgentConfig(type: string): AgentConfig {
  return registry.getConfig(type);
}

/**
 * List all registered agent types
 */
export function listAgentTypes(): string[] {
  return registry.listTypes();
}

/**
 * List all registered agents
 */
export function listAllAgents(): Array<{ type: string; config: AgentConfig }> {
  return registry.listAll();
}
