/**
 * MCP Tool Embedding Service
 *
 * Generates and manages vector embeddings for MCP tools.
 * Enables semantic search-based tool discovery.
 *
 * Part of Search-Based MCP Tool Discovery (Phase 1)
 */

import { createHash } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { dbClient } from '@/lib/db/client';
import { mcpToolEmbeddings } from '@/lib/db/schema';
import { embeddingService } from '@/lib/embeddings';
import type { MCPTool } from '../types';
import type { EnrichedToolDescription, ToolEmbedding } from './types';

const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Enrich tool description by combining name, description, and input schema
 * Creates a comprehensive text representation for better semantic matching
 */
export function enrichToolDescription(tool: MCPTool): EnrichedToolDescription {
  const parts: string[] = [];

  // Tool name (with spaces between camelCase/snake_case)
  const readableName = tool.name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
  parts.push(`Tool: ${readableName}`);

  // Description
  if (tool.description) {
    parts.push(`Description: ${tool.description}`);
  }

  // Input schema - extract parameter names and descriptions
  if (tool.inputSchema && typeof tool.inputSchema === 'object') {
    const schema = tool.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown> | undefined;

    if (properties && typeof properties === 'object') {
      const paramParts: string[] = [];
      for (const [paramName, paramDef] of Object.entries(properties)) {
        if (paramDef && typeof paramDef === 'object') {
          const def = paramDef as Record<string, unknown>;
          const desc = def.description ? `: ${def.description}` : '';
          const type = def.type ? ` (${def.type})` : '';
          paramParts.push(`${paramName}${type}${desc}`);
        }
      }
      if (paramParts.length > 0) {
        parts.push(`Parameters: ${paramParts.join(', ')}`);
      }
    }

    // Include required fields
    const required = schema.required as string[] | undefined;
    if (required && Array.isArray(required) && required.length > 0) {
      parts.push(`Required: ${required.join(', ')}`);
    }
  }

  // Server context
  parts.push(`Server: ${tool.serverName}`);

  const enriched = parts.join('. ');
  const schemaHash = hashInputSchema(tool.inputSchema);

  return {
    original: tool.description || '',
    enriched,
    schemaHash,
  };
}

/**
 * Generate a hash of the input schema for cache invalidation
 */
function hashInputSchema(schema: Record<string, unknown>): string {
  const normalized = JSON.stringify(schema, Object.keys(schema).sort());
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Generate vector embedding for tool description text
 */
export async function generateToolEmbedding(text: string): Promise<number[]> {
  const result = await embeddingService.generateEmbedding(text);
  return result.embedding;
}

/**
 * Sync tool embeddings to database
 * Creates new embeddings, updates changed ones, and removes stale ones
 */
export async function syncToolEmbeddings(
  userId: string,
  serverId: string,
  tools: MCPTool[]
): Promise<{
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}> {
  const db = dbClient.getDb();
  const stats = { created: 0, updated: 0, deleted: 0, unchanged: 0 };

  // Fetch existing embeddings for this server
  const existing = await db
    .select()
    .from(mcpToolEmbeddings)
    .where(
      and(
        eq(mcpToolEmbeddings.userId, userId),
        eq(mcpToolEmbeddings.serverId, serverId)
      )
    );

  const existingMap = new Map(existing.map((e) => [e.toolName, e]));
  const currentToolNames = new Set(tools.map((t) => t.name));

  // Delete stale embeddings (tools no longer present)
  for (const [toolName, record] of existingMap) {
    if (!currentToolNames.has(toolName)) {
      await db
        .delete(mcpToolEmbeddings)
        .where(eq(mcpToolEmbeddings.id, record.id));
      stats.deleted++;
    }
  }

  // Create or update embeddings for current tools
  for (const tool of tools) {
    const enriched = enrichToolDescription(tool);
    const existingRecord = existingMap.get(tool.name);

    // Skip if schema hasn't changed
    if (existingRecord && existingRecord.inputSchemaHash === enriched.schemaHash) {
      stats.unchanged++;
      continue;
    }

    // Generate new embedding
    const embedding = await generateToolEmbedding(enriched.enriched);

    if (existingRecord) {
      // Update existing record
      await db
        .update(mcpToolEmbeddings)
        .set({
          description: tool.description || null,
          enrichedDescription: enriched.enriched,
          embedding,
          inputSchemaHash: enriched.schemaHash,
          embeddingModel: EMBEDDING_MODEL,
          updatedAt: new Date(),
        })
        .where(eq(mcpToolEmbeddings.id, existingRecord.id));
      stats.updated++;
    } else {
      // Create new record
      await db.insert(mcpToolEmbeddings).values({
        userId,
        serverId,
        toolName: tool.name,
        description: tool.description || null,
        enrichedDescription: enriched.enriched,
        embedding,
        inputSchemaHash: enriched.schemaHash,
        embeddingModel: EMBEDDING_MODEL,
        enabled: true,
      });
      stats.created++;
    }
  }

  console.log(
    `[ToolEmbeddings] Synced server ${serverId}: ` +
      `${stats.created} created, ${stats.updated} updated, ` +
      `${stats.deleted} deleted, ${stats.unchanged} unchanged`
  );

  return stats;
}

/**
 * Fetch a single tool embedding from the database
 */
export async function getToolEmbedding(
  userId: string,
  serverId: string,
  toolName: string
): Promise<ToolEmbedding | null> {
  const db = dbClient.getDb();

  const results = await db
    .select()
    .from(mcpToolEmbeddings)
    .where(
      and(
        eq(mcpToolEmbeddings.userId, userId),
        eq(mcpToolEmbeddings.serverId, serverId),
        eq(mcpToolEmbeddings.toolName, toolName)
      )
    )
    .limit(1);

  if (results.length === 0) {
    return null;
  }

  const record = results[0];
  return {
    id: record.id,
    serverId: record.serverId,
    toolName: record.toolName,
    description: record.description,
    enrichedDescription: record.enrichedDescription,
    embedding: record.embedding || [],
    inputSchemaHash: record.inputSchemaHash,
    enabled: record.enabled,
  };
}

/**
 * Fetch all tool embeddings for a user
 */
export async function getUserToolEmbeddings(
  userId: string,
  options?: { serverIds?: string[]; enabledOnly?: boolean }
): Promise<ToolEmbedding[]> {
  const db = dbClient.getDb();

  let query = db
    .select()
    .from(mcpToolEmbeddings)
    .where(eq(mcpToolEmbeddings.userId, userId));

  const results = await query;

  // Filter in memory for additional conditions
  let filtered = results;

  if (options?.serverIds && options.serverIds.length > 0) {
    const serverIdSet = new Set(options.serverIds);
    filtered = filtered.filter((r) => serverIdSet.has(r.serverId));
  }

  if (options?.enabledOnly) {
    filtered = filtered.filter((r) => r.enabled);
  }

  return filtered.map((record) => ({
    id: record.id,
    serverId: record.serverId,
    toolName: record.toolName,
    description: record.description,
    enrichedDescription: record.enrichedDescription,
    embedding: record.embedding || [],
    inputSchemaHash: record.inputSchemaHash,
    enabled: record.enabled,
  }));
}

/**
 * Delete all embeddings for a server (called when server is deleted)
 */
export async function deleteServerEmbeddings(
  userId: string,
  serverId: string
): Promise<number> {
  const db = dbClient.getDb();

  const result = await db
    .delete(mcpToolEmbeddings)
    .where(
      and(
        eq(mcpToolEmbeddings.userId, userId),
        eq(mcpToolEmbeddings.serverId, serverId)
      )
    )
    .returning({ id: mcpToolEmbeddings.id });

  console.log(`[ToolEmbeddings] Deleted ${result.length} embeddings for server ${serverId}`);
  return result.length;
}

/**
 * Toggle enabled status for a tool embedding
 */
export async function setToolEmbeddingEnabled(
  userId: string,
  serverId: string,
  toolName: string,
  enabled: boolean
): Promise<boolean> {
  const db = dbClient.getDb();

  const result = await db
    .update(mcpToolEmbeddings)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(mcpToolEmbeddings.userId, userId),
        eq(mcpToolEmbeddings.serverId, serverId),
        eq(mcpToolEmbeddings.toolName, toolName)
      )
    )
    .returning({ id: mcpToolEmbeddings.id });

  return result.length > 0;
}
