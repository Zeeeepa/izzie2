/**
 * MCP Tool Discovery Types
 *
 * Types for semantic search-based tool discovery.
 * Part of Search-Based MCP Tool Discovery (Phase 1)
 */

import type { MCPTool } from '../types';

/**
 * Stored tool embedding with metadata
 */
export interface ToolEmbedding {
  id: string;
  serverId: string;
  toolName: string;
  description: string | null;
  enrichedDescription: string;
  embedding: number[];
  inputSchemaHash: string;
  enabled: boolean;
}

/**
 * Search result with similarity score
 */
export interface ToolSearchResult {
  tool: MCPTool;
  similarity: number;
  source: 'semantic' | 'core' | 'fallback';
}

/**
 * Configuration for tool discovery
 */
export interface ToolDiscoveryConfig {
  /** Maximum number of tools to return (default: 10) */
  maxTools: number;
  /** Minimum similarity threshold for inclusion (default: 0.3) */
  similarityThreshold: number;
  /** Whether to include core tools regardless of similarity (default: true) */
  enableFallback: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_TOOL_DISCOVERY_CONFIG: ToolDiscoveryConfig = {
  maxTools: 10,
  similarityThreshold: 0.3,
  enableFallback: true,
};

/**
 * Options for discovering tools
 */
export interface ToolDiscoveryOptions {
  userId: string;
  query: string;
  limit?: number;
  similarityThreshold?: number;
  includeCoreTools?: boolean;
  serverIds?: string[];
}

/**
 * Result from tool discovery
 */
export interface ToolDiscoveryResult {
  tools: ToolSearchResult[];
  totalSearched: number;
  searchDurationMs: number;
  embeddingGenerated: boolean;
}

/**
 * Input for generating tool embedding
 */
export interface ToolEmbeddingInput {
  userId: string;
  serverId: string;
  tool: MCPTool;
}

/**
 * Enriched tool description for better semantic matching
 */
export interface EnrichedToolDescription {
  original: string;
  enriched: string;
  schemaHash: string;
}

/**
 * Options for searching tools by vector similarity
 */
export interface ToolSearchOptions {
  userId: string;
  queryEmbedding: number[];
  limit?: number;
  similarityThreshold?: number;
  serverIds?: string[];
}

/**
 * Raw search result from database (before hydration with full tool data)
 */
export interface RawToolSearchResult {
  toolName: string;
  serverId: string;
  similarity: number;
  enrichedDescription: string;
}

/**
 * Tool embedding status for a server
 */
export interface ServerEmbeddingStatus {
  serverId: string;
  serverName: string;
  totalTools: number;
  embeddedTools: number;
  outdatedTools: number;
  lastUpdated: Date | null;
}

/**
 * Result from tool discovery orchestration
 */
export interface DiscoveredTools {
  tools: ToolSearchResult[];
  searchQuery: string;
  totalAvailable: number;
}

/**
 * Session context for enhanced tool discovery
 */
export interface SessionContext {
  previousMessages?: string[];
  previousTools?: string[];
  sessionId?: string;
}

/**
 * Stats from embedding refresh operation
 */
export interface EmbeddingRefreshStats {
  serversProcessed: number;
  toolsCreated: number;
  toolsUpdated: number;
  toolsDeleted: number;
  toolsUnchanged: number;
  errors: string[];
}
