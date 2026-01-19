/**
 * MCP Client Manager
 *
 * Manages connections to external MCP servers and provides
 * a unified interface for tool discovery and execution.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPServerStatus,
  MCPToolCall
} from './types';

const LOG_PREFIX = '[MCP Client]';

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private serverStatuses: Map<string, MCPServerStatus> = new Map();

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<MCPServerStatus> {
    console.log(`${LOG_PREFIX} Connecting to ${config.name} (${config.transport})...`);

    try {
      let transport;

      if (config.transport === 'sse' && config.url) {
        transport = new SSEClientTransport(new URL(config.url));
      } else if (config.transport === 'stdio' && config.command) {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: config.env,
        });
      } else {
        throw new Error(`Unsupported transport: ${config.transport}`);
      }

      const client = new Client({
        name: 'izzie',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await client.connect(transport);
      this.clients.set(config.id, client);

      // Discover tools and resources
      const tools = await this.discoverTools(config.id, config.name);
      const resources = await this.discoverResources(config.id);

      const status: MCPServerStatus = {
        serverId: config.id,
        connected: true,
        lastConnected: new Date(),
        tools,
        resources,
      };

      this.serverStatuses.set(config.id, status);
      console.log(`${LOG_PREFIX} Connected to ${config.name}: ${tools.length} tools, ${resources.length} resources`);

      return status;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to connect to ${config.name}:`, error);

      const status: MCPServerStatus = {
        serverId: config.id,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tools: [],
        resources: [],
      };

      this.serverStatuses.set(config.id, status);
      return status;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
      this.serverStatuses.delete(serverId);
      console.log(`${LOG_PREFIX} Disconnected from server ${serverId}`);
    }
  }

  /**
   * Discover available tools from a connected server
   */
  private async discoverTools(serverId: string, serverName: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverId);
    if (!client) return [];

    try {
      const result = await client.listTools();
      return (result.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverId,
        serverName,
      }));
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to list tools:`, error);
      return [];
    }
  }

  /**
   * Discover available resources from a connected server
   */
  private async discoverResources(serverId: string): Promise<MCPResource[]> {
    const client = this.clients.get(serverId);
    if (!client) return [];

    try {
      const result = await client.listResources();
      return (result.resources || []).map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId,
      }));
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to list resources:`, error);
      return [];
    }
  }

  /**
   * Execute a tool on an MCP server
   */
  async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }

    console.log(`${LOG_PREFIX} Executing tool ${toolName} on server ${serverId}`);

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return result;
  }

  /**
   * Read a resource from an MCP server
   */
  async readResource(serverId: string, uri: string): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }

    const result = await client.readResource({ uri });
    return result;
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    this.serverStatuses.forEach(status => {
      if (status.connected) {
        tools.push(...status.tools);
      }
    });
    return tools;
  }

  /**
   * Get status of all servers
   */
  getAllStatuses(): MCPServerStatus[] {
    const statuses: MCPServerStatus[] = [];
    this.serverStatuses.forEach(status => statuses.push(status));
    return statuses;
  }

  /**
   * Get status of a specific server
   */
  getStatus(serverId: string): MCPServerStatus | undefined {
    return this.serverStatuses.get(serverId);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    return this.serverStatuses.get(serverId)?.connected || false;
  }
}

// Singleton instance
let mcpClientManager: MCPClientManager | null = null;

export function getMCPClientManager(): MCPClientManager {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
  }
  return mcpClientManager;
}
