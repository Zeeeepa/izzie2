/**
 * Agent Registry
 * Central registry for all Izzie agents
 *
 * Part of the Standardized Long-Running Agent Framework (#92)
 */

import type { IzzieAgent } from './types';

/**
 * Registered agent metadata
 */
export interface RegisteredAgent {
  name: string;
  version: string;
  description: string;
  trigger: string;
  sources: string[];
  registeredAt: Date;
}

/**
 * Agent Registry singleton
 * Manages registration and lookup of all agents
 */
class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, IzzieAgent> = new Map();
  private metadata: Map<string, RegisteredAgent> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Register an agent
   */
  register<TInput, TOutput>(agent: IzzieAgent<TInput, TOutput>): void {
    if (this.agents.has(agent.name)) {
      console.warn(`[AgentRegistry] Agent "${agent.name}" already registered, replacing`);
    }

    this.agents.set(agent.name, agent as IzzieAgent);
    this.metadata.set(agent.name, {
      name: agent.name,
      version: agent.version,
      description: agent.description,
      trigger: agent.config.trigger || `izzie/agent.${agent.name}`,
      sources: agent.sources,
      registeredAt: new Date(),
    });

    console.log(`[AgentRegistry] Registered agent: ${agent.name} v${agent.version}`);
  }

  /**
   * Get an agent by name
   */
  get<TInput = unknown, TOutput = unknown>(
    name: string
  ): IzzieAgent<TInput, TOutput> | undefined {
    return this.agents.get(name) as IzzieAgent<TInput, TOutput> | undefined;
  }

  /**
   * Check if an agent is registered
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Get all registered agents
   */
  getAll(): IzzieAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get metadata for all registered agents
   */
  getAllMetadata(): RegisteredAgent[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get metadata for a specific agent
   */
  getMetadata(name: string): RegisteredAgent | undefined {
    return this.metadata.get(name);
  }

  /**
   * Unregister an agent
   */
  unregister(name: string): boolean {
    const deleted = this.agents.delete(name);
    this.metadata.delete(name);

    if (deleted) {
      console.log(`[AgentRegistry] Unregistered agent: ${name}`);
    }

    return deleted;
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    this.agents.clear();
    this.metadata.clear();
    console.log('[AgentRegistry] Cleared all agents');
  }

  /**
   * Get count of registered agents
   */
  get count(): number {
    return this.agents.size;
  }

  /**
   * Get all agent names
   */
  getNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Find agents by source
   */
  findBySource(source: string): IzzieAgent[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.sources.includes(source as any)
    );
  }
}

// Export singleton instance
export const agentRegistry = AgentRegistry.getInstance();

// Export class for testing
export { AgentRegistry };

/**
 * Helper function to register an agent
 */
export function registerAgent<TInput, TOutput>(
  agent: IzzieAgent<TInput, TOutput>
): void {
  agentRegistry.register(agent);
}

/**
 * Helper function to get an agent
 */
export function getAgent<TInput = unknown, TOutput = unknown>(
  name: string
): IzzieAgent<TInput, TOutput> | undefined {
  return agentRegistry.get<TInput, TOutput>(name);
}

/**
 * Helper function to list all agents
 */
export function listAgents(): RegisteredAgent[] {
  return agentRegistry.getAllMetadata();
}
