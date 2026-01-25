/**
 * MCP Tool Vector Search Service
 *
 * Performs semantic search on MCP tool embeddings using pgvector.
 * Enables context-aware tool selection based on user messages.
 *
 * Part of Search-Based MCP Tool Discovery (Phase 1)
 */

import { dbClient } from '@/lib/db/client';
import { generateToolEmbedding } from './tool-embeddings';
import type { MCPTool } from '../types';
import type { ToolSearchResult, RawToolSearchResult } from './types';

const LOG_PREFIX = '[ToolSearch]';

/**
 * Search configuration with defaults
 */
interface SearchConfig {
  maxTools?: number;
  similarityThreshold?: number;
  serverIds?: string[];
}

const DEFAULT_CONFIG: Required<Omit<SearchConfig, 'serverIds'>> = {
  maxTools: 10,
  similarityThreshold: 0.3,
};

/**
 * Search for tools semantically matching a query
 *
 * Uses pgvector cosine similarity to find relevant tools
 * based on the user's natural language query.
 */
export async function searchTools(
  userId: string,
  query: string,
  config?: SearchConfig
): Promise<ToolSearchResult[]> {
  const maxTools = config?.maxTools ?? DEFAULT_CONFIG.maxTools;
  const threshold = config?.similarityThreshold ?? DEFAULT_CONFIG.similarityThreshold;
  const serverIds = config?.serverIds;

  const startTime = Date.now();

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateToolEmbedding(query);

    // Build the vector search query
    const results = await executeVectorSearch(
      userId,
      queryEmbedding,
      threshold,
      maxTools,
      serverIds
    );

    const duration = Date.now() - startTime;
    console.log(
      `${LOG_PREFIX} Search completed in ${duration}ms: ` +
        `${results.length} tools found for query "${query.substring(0, 50)}..."`
    );

    return results;
  } catch (error) {
    console.error(`${LOG_PREFIX} Search error:`, error);
    throw error;
  }
}

/**
 * Execute the pgvector similarity search
 */
async function executeVectorSearch(
  userId: string,
  queryEmbedding: number[],
  threshold: number,
  limit: number,
  serverIds?: string[]
): Promise<ToolSearchResult[]> {
  // Convert embedding to pgvector format
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Build query with optional server filter
  let query: string;
  let params: unknown[];

  if (serverIds && serverIds.length > 0) {
    query = `
      SELECT
        tool_name as "toolName",
        server_id as "serverId",
        description,
        enriched_description as "enrichedDescription",
        1 - (embedding <=> $1::vector) as similarity
      FROM mcp_tool_embeddings
      WHERE user_id = $2
        AND enabled = true
        AND server_id = ANY($3)
        AND 1 - (embedding <=> $1::vector) >= $4
      ORDER BY similarity DESC
      LIMIT $5
    `;
    params = [embeddingStr, userId, serverIds, threshold, limit];
  } else {
    query = `
      SELECT
        tool_name as "toolName",
        server_id as "serverId",
        description,
        enriched_description as "enrichedDescription",
        1 - (embedding <=> $1::vector) as similarity
      FROM mcp_tool_embeddings
      WHERE user_id = $2
        AND enabled = true
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY similarity DESC
      LIMIT $4
    `;
    params = [embeddingStr, userId, threshold, limit];
  }

  const rows = await dbClient.executeRaw<RawToolSearchResult>(query, params);

  // Convert to ToolSearchResult format
  // Note: We construct MCPTool from stored data since we don't have full tool data
  return rows.map((row) => ({
    tool: {
      name: row.toolName,
      description: row.enrichedDescription.split('. Description: ')[1]?.split('. Parameters:')[0] || undefined,
      inputSchema: {}, // Schema not stored in search results - will be hydrated if needed
      serverId: row.serverId,
      serverName: '', // Server name not in embeddings table - will be hydrated if needed
    } as MCPTool,
    similarity: Number(row.similarity),
    source: 'semantic' as const,
  }));
}

/**
 * Intelligent search for tools based on message context
 *
 * Analyzes the message intent and optionally boosts relevance
 * of previously used tools for conversation continuity.
 */
export async function searchToolsForMessage(
  userId: string,
  message: string,
  previousTools?: string[]
): Promise<ToolSearchResult[]> {
  const startTime = Date.now();

  // Extract key phrases from the message for better search
  const searchQuery = extractSearchQuery(message);

  // Perform semantic search
  const results = await searchTools(userId, searchQuery, {
    maxTools: 15, // Get more results for re-ranking
    similarityThreshold: 0.25, // Lower threshold for initial retrieval
  });

  // Boost previously used tools if they're still relevant
  if (previousTools && previousTools.length > 0) {
    const previousToolSet = new Set(previousTools);

    // Re-score results with continuity bonus
    const rerankedResults = results.map((result) => {
      const continuityBonus = previousToolSet.has(result.tool.name) ? 0.1 : 0;
      return {
        ...result,
        similarity: Math.min(1.0, result.similarity + continuityBonus),
      };
    });

    // Re-sort by adjusted similarity
    rerankedResults.sort((a, b) => b.similarity - a.similarity);

    // Return top 10
    const finalResults = rerankedResults.slice(0, 10);

    const duration = Date.now() - startTime;
    console.log(
      `${LOG_PREFIX} Message search completed in ${duration}ms: ` +
        `${finalResults.length} tools (${previousTools.length} previous considered)`
    );

    return finalResults;
  }

  const duration = Date.now() - startTime;
  console.log(
    `${LOG_PREFIX} Message search completed in ${duration}ms: ${results.slice(0, 10).length} tools`
  );

  return results.slice(0, 10);
}

/**
 * Extract search-relevant text from a user message
 *
 * Removes common filler words and focuses on action/intent.
 */
function extractSearchQuery(message: string): string {
  // Remove common conversational prefixes
  let query = message
    .replace(/^(can you|could you|please|i want to|i need to|help me|i'd like to)/i, '')
    .trim();

  // Remove question marks and trailing punctuation
  query = query.replace(/[?!.]+$/, '').trim();

  // If the query is too short, use original message
  if (query.length < 10) {
    return message;
  }

  return query;
}

/**
 * Find tools similar to a given tool
 *
 * Useful for suggesting alternatives or related tools.
 */
export async function findSimilarTools(
  userId: string,
  toolName: string,
  serverId: string,
  limit: number = 5
): Promise<ToolSearchResult[]> {
  // Get the embedding for the reference tool
  const query = `
    SELECT embedding
    FROM mcp_tool_embeddings
    WHERE user_id = $1
      AND server_id = $2
      AND tool_name = $3
      AND enabled = true
    LIMIT 1
  `;

  const rows = await dbClient.executeRaw<{ embedding: number[] }>(query, [
    userId,
    serverId,
    toolName,
  ]);

  if (rows.length === 0) {
    console.warn(`${LOG_PREFIX} Tool not found: ${toolName} on server ${serverId}`);
    return [];
  }

  const referenceEmbedding = rows[0].embedding;

  // Find similar tools (excluding the reference tool)
  const searchQuery = `
    SELECT
      tool_name as "toolName",
      server_id as "serverId",
      description,
      enriched_description as "enrichedDescription",
      1 - (embedding <=> $1::vector) as similarity
    FROM mcp_tool_embeddings
    WHERE user_id = $2
      AND enabled = true
      AND NOT (server_id = $3 AND tool_name = $4)
      AND 1 - (embedding <=> $1::vector) >= 0.3
    ORDER BY similarity DESC
    LIMIT $5
  `;

  const embeddingStr = `[${referenceEmbedding.join(',')}]`;
  const similarRows = await dbClient.executeRaw<RawToolSearchResult>(searchQuery, [
    embeddingStr,
    userId,
    serverId,
    toolName,
    limit,
  ]);

  return similarRows.map((row) => ({
    tool: {
      name: row.toolName,
      description: row.enrichedDescription.split('. Description: ')[1]?.split('. Parameters:')[0] || undefined,
      inputSchema: {},
      serverId: row.serverId,
      serverName: '',
    } as MCPTool,
    similarity: Number(row.similarity),
    source: 'semantic' as const,
  }));
}
