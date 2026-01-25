/**
 * MCP Tool Discovery Orchestration Service
 *
 * Main entry point for semantic tool discovery in chat.
 * Coordinates server connections, embedding sync, and tool search.
 *
 * Part of Search-Based MCP Tool Discovery (Phase 1)
 */

import { sql } from 'drizzle-orm';
import { dbClient } from '@/lib/db/client';
import { getMCPClientManager } from '../client';
import { syncToolEmbeddings } from './tool-embeddings';
import { searchToolsForMessage } from './tool-search';
import type { MCPServerConfig, MCPTransport, MCPTool } from '../types';
import type {
  DiscoveredTools,
  SessionContext,
  EmbeddingRefreshStats,
  ToolSearchResult,
} from './types';

const LOG_PREFIX = '[ToolDiscovery]';

/**
 * Database row type for MCP servers query
 */
interface MCPServerRow {
  id: string;
  user_id: string;
  name: string;
  transport: string;
  command: string | null;
  args: string[] | null;
  url: string | null;
  headers: Record<string, string> | null;
  enabled: boolean;
  [key: string]: unknown;
}

/**
 * Main orchestration function for tool discovery
 *
 * Coordinates the full discovery flow:
 * 1. Get user's enabled MCP servers
 * 2. Ensure tool embeddings are synced
 * 3. Search for relevant tools based on message
 */
export async function discoverToolsForChat(
  userId: string,
  message: string,
  sessionContext?: SessionContext
): Promise<DiscoveredTools> {
  const startTime = Date.now();

  try {
    // 1. Get user's enabled MCP servers
    const servers = await getEnabledServers(userId);

    if (servers.length === 0) {
      console.log(`${LOG_PREFIX} No enabled MCP servers for user ${userId}`);
      return {
        tools: [],
        searchQuery: message,
        totalAvailable: 0,
      };
    }

    // 2. Count total available tools for metadata
    const totalTools = await countUserToolEmbeddings(userId);

    // 3. Search for relevant tools
    const previousTools = sessionContext?.previousTools;
    const tools = await searchToolsForMessage(userId, message, previousTools);

    const duration = Date.now() - startTime;
    console.log(
      `${LOG_PREFIX} Discovery completed in ${duration}ms: ` +
        `${tools.length} tools selected from ${totalTools} available`
    );

    return {
      tools,
      searchQuery: message,
      totalAvailable: totalTools,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Discovery error:`, error);
    throw error;
  }
}

/**
 * Refresh tool embeddings for all of a user's MCP servers
 *
 * Background sync operation that:
 * 1. Connects to each enabled server
 * 2. Fetches current tools
 * 3. Syncs embeddings (create/update/delete)
 */
export async function refreshUserToolEmbeddings(
  userId: string
): Promise<EmbeddingRefreshStats> {
  const startTime = Date.now();
  const stats: EmbeddingRefreshStats = {
    serversProcessed: 0,
    toolsCreated: 0,
    toolsUpdated: 0,
    toolsDeleted: 0,
    toolsUnchanged: 0,
    errors: [],
  };

  try {
    const servers = await getEnabledServers(userId);
    const clientManager = getMCPClientManager();

    for (const server of servers) {
      try {
        // Connect to server if not already connected
        if (!clientManager.isConnected(server.id)) {
          await clientManager.connect(server);
        }

        // Get server status with tools
        const status = clientManager.getStatus(server.id);
        if (!status || !status.connected) {
          stats.errors.push(`Failed to connect to server: ${server.name}`);
          continue;
        }

        // Sync embeddings for this server's tools
        const syncResult = await syncToolEmbeddings(userId, server.id, status.tools);

        stats.serversProcessed++;
        stats.toolsCreated += syncResult.created;
        stats.toolsUpdated += syncResult.updated;
        stats.toolsDeleted += syncResult.deleted;
        stats.toolsUnchanged += syncResult.unchanged;
      } catch (serverError) {
        const errorMsg =
          serverError instanceof Error ? serverError.message : 'Unknown error';
        stats.errors.push(`Server ${server.name}: ${errorMsg}`);
        console.error(`${LOG_PREFIX} Error syncing server ${server.name}:`, serverError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `${LOG_PREFIX} Embedding refresh completed in ${duration}ms: ` +
        `${stats.serversProcessed} servers, ${stats.toolsCreated} created, ` +
        `${stats.toolsUpdated} updated, ${stats.toolsDeleted} deleted`
    );

    return stats;
  } catch (error) {
    console.error(`${LOG_PREFIX} Refresh error:`, error);
    throw error;
  }
}

/**
 * Simple entry point for chat route tool discovery
 *
 * Converts discovered tools to the chat API tool format.
 * Handles errors gracefully by returning empty array.
 */
export async function getToolsForContext(
  userId: string,
  message: string
): Promise<MCPTool[]> {
  try {
    const discovered = await discoverToolsForChat(userId, message);
    return discovered.tools.map((result) => result.tool);
  } catch (error) {
    console.error(`${LOG_PREFIX} getToolsForContext error:`, error);
    // Return empty array on error - don't break chat
    return [];
  }
}

/**
 * Get enabled MCP servers for a user
 */
async function getEnabledServers(userId: string): Promise<MCPServerConfig[]> {
  const db = dbClient.getDb();

  const result = await db.execute<MCPServerRow>(sql`
    SELECT id, user_id, name, transport, command, args, url, headers, enabled
    FROM mcp_servers
    WHERE user_id = ${userId} AND enabled = true
    ORDER BY name
  `);

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    transport: row.transport as MCPTransport,
    command: row.command || undefined,
    args: row.args || undefined,
    url: row.url || undefined,
    headers: row.headers || undefined,
    enabled: row.enabled,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/**
 * Count total tool embeddings for a user
 */
async function countUserToolEmbeddings(userId: string): Promise<number> {
  const result = await dbClient.executeRaw<{ count: string }>(
    `SELECT COUNT(*) as count FROM mcp_tool_embeddings WHERE user_id = $1 AND enabled = true`,
    [userId]
  );

  return parseInt(result[0]?.count || '0', 10);
}
