/**
 * Memory Service
 *
 * Integrated memory service using:
 * - Mem0 for memory management
 * - pgvector (Neon Postgres) for persistent vector storage
 * - Neo4j graph for entity relationships
 * - OpenAI embeddings for semantic search
 *
 * Combines semantic search (vector similarity) with graph traversal
 * for comprehensive memory retrieval.
 */

import type { MemoryEntry as TypeMemoryEntry } from '@/types';
import type { MemoryEntry as DbMemoryEntry } from '@/lib/db/schema';
import { MemoryClient } from 'mem0ai';
import { neo4jClient } from '@/lib/graph';
import { vectorOps, type VectorSearchResult } from '@/lib/db/vectors';
import { embeddingService } from '@/lib/embeddings';

/**
 * Memory configuration
 */
interface MemoryConfig {
  enableGraph?: boolean;
  enableVectorPersistence?: boolean;
  llmModel?: string;
}

/**
 * Search options
 */
interface SearchOptions {
  limit?: number;
  filters?: Record<string, unknown>;
  includeGraph?: boolean;
  conversationId?: string;
  threshold?: number; // Similarity threshold (0-1)
  minImportance?: number;
}

/**
 * Hybrid search result
 */
interface HybridSearchResult {
  memories: TypeMemoryEntry[];
  graphResults?: any[];
  combined: TypeMemoryEntry[];
  metadata?: {
    vectorResults: number;
    graphResults: number;
    combinedResults: number;
  };
}

export class MemoryService {
  private mem0: MemoryClient | null = null;
  private config: Required<MemoryConfig>;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      enableGraph: config.enableGraph ?? true,
      enableVectorPersistence: config.enableVectorPersistence ?? true,
      llmModel: config.llmModel || 'gpt-4.1-nano-2025-04-14',
    };

    // Only initialize Mem0 if Neo4j is configured
    if (this.isGraphConfigured()) {
      this.initialize();
    } else {
      console.warn(
        '[Memory] Neo4j not configured. Graph features will be disabled.'
      );
    }

    if (this.config.enableVectorPersistence) {
      console.log('[Memory] pgvector persistence enabled (Neon Postgres)');
    }
  }

  /**
   * Check if Neo4j is configured
   */
  private isGraphConfigured(): boolean {
    return neo4jClient.isConfigured();
  }

  /**
   * Initialize Mem0 with Neo4j graph store
   */
  private initialize(): void {
    try {
      const mem0Config: any = {
        version: 'v1.1',
        enableGraph: this.config.enableGraph,
      };

      // Configure graph store if enabled
      if (this.config.enableGraph) {
        mem0Config.graph_store = {
          provider: 'neo4j',
          config: {
            url: process.env.NEO4J_URI,
            username: process.env.NEO4J_USER || 'neo4j',
            password: process.env.NEO4J_PASSWORD,
          },
        };
      }

      // Configure vector store (still use Mem0's in-memory for Mem0 operations)
      // Actual persistence happens via pgvector
      mem0Config.vector_store = {
        provider: 'memory',
      };

      // Configure LLM
      if (process.env.OPENROUTER_API_KEY) {
        mem0Config.llm = {
          provider: 'openai',
          config: {
            model: this.config.llmModel,
            api_key: process.env.OPENROUTER_API_KEY,
            base_url: 'https://openrouter.ai/api/v1',
          },
        };
      }

      this.mem0 = new MemoryClient(mem0Config);
      console.log('[Memory] Mem0 initialized with Neo4j graph store + pgvector persistence');
    } catch (error) {
      console.error('[Memory] Failed to initialize Mem0:', error);
      this.mem0 = null;
    }
  }

  /**
   * Store a memory entry
   * Stores in both Mem0 (graph) and pgvector (persistent storage)
   */
  async store(
    entry: Omit<TypeMemoryEntry, 'id' | 'createdAt'>,
    options: {
      conversationId?: string;
      importance?: number;
      summary?: string;
    } = {}
  ): Promise<TypeMemoryEntry> {
    try {
      // 1. Generate embedding for the content
      const embedding = await embeddingService.generateEmbeddingWithFallback(
        entry.content
      );

      // 2. Store in pgvector (persistent storage)
      let dbEntry: DbMemoryEntry | null = null;
      if (this.config.enableVectorPersistence) {
        dbEntry = await vectorOps.insertVector({
          userId: entry.userId,
          content: entry.content,
          embedding,
          conversationId: options.conversationId,
          summary: options.summary,
          metadata: entry.metadata,
          importance: options.importance || 5,
        });

        console.log('[Memory] Stored in pgvector:', dbEntry.id);
      }

      // 3. Store in Mem0 (for graph relationships)
      if (this.mem0 && this.config.enableGraph) {
        try {
          const messages = [{ role: 'user' as const, content: entry.content }];
          const mem0Options = {
            user_id: entry.userId,
            metadata: entry.metadata,
          };

          const mem0Result = await this.mem0.add(messages, mem0Options);
          console.log('[Memory] Stored in Mem0 graph:', mem0Result);
        } catch (error) {
          console.error('[Memory] Error storing in Mem0 (non-fatal):', error);
        }
      }

      // Return standardized format
      return {
        id: dbEntry?.id || 'mem0-only',
        userId: entry.userId,
        content: entry.content,
        metadata: entry.metadata,
        createdAt: dbEntry?.createdAt || new Date(),
      };
    } catch (error) {
      console.error('[Memory] Error storing memory:', error);
      throw error;
    }
  }

  /**
   * Retrieve memories using semantic search
   * Uses pgvector for persistent, efficient vector similarity search
   */
  async retrieve(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<TypeMemoryEntry[]> {
    try {
      // 1. Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbeddingWithFallback(query);

      // 2. Search using pgvector
      const vectorResults = await vectorOps.searchSimilar(queryEmbedding, {
        userId,
        conversationId: options.conversationId,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7,
        minImportance: options.minImportance || 1,
        excludeDeleted: true,
      });

      console.log(
        `[Memory] Retrieved ${vectorResults.length} memories from pgvector for query: ${query}`
      );

      // 3. Convert to standard format
      return vectorResults.map((result: VectorSearchResult) => ({
        id: result.id,
        userId: result.userId,
        content: result.content,
        metadata: {
          ...result.metadata,
          similarity: result.similarity,
          importance: result.importance,
          accessCount: result.accessCount,
        },
        createdAt: result.createdAt,
      }));
    } catch (error) {
      console.error('[Memory] Error retrieving memories:', error);
      return [];
    }
  }

  /**
   * Hybrid search: Combine semantic search with graph traversal
   * Uses optimized retrieval service with smart query parsing and weighted ranking
   */
  async hybridSearch(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<HybridSearchResult> {
    try {
      // Use optimized retrieval service
      const { retrievalService } = await import('@/lib/retrieval');

      const result = await retrievalService.search(userId, query, {
        conversationId: options.conversationId,
        limit: options.limit || 10,
        includeGraph: options.includeGraph ?? true,
      });

      // Convert ranked results back to MemoryEntry format
      const memories = result.results
        .filter((r) => r.source === 'vector')
        .map((r) => r.content as TypeMemoryEntry);

      const graphResults = result.results
        .filter((r) => r.source === 'graph')
        .map((r) => r.content);

      const combined = result.results.map((r) =>
        r.source === 'vector'
          ? (r.content as TypeMemoryEntry)
          : this.convertGraphToMemory(r.content)
      );

      console.log(
        `[Memory] Hybrid search completed in ${result.metadata.executionTime}ms (${result.results.length} results)`
      );

      return {
        memories,
        graphResults: options.includeGraph ? graphResults : undefined,
        combined,
        metadata: {
          vectorResults: result.metadata.vectorResults,
          graphResults: result.metadata.graphResults,
          combinedResults: result.metadata.finalResults,
        },
      };
    } catch (error) {
      console.error('[Memory] Error in optimized hybrid search:', error);

      // Fallback to simple semantic search
      const semanticResults = await this.retrieve(userId, query, options);

      return {
        memories: semanticResults,
        graphResults: [],
        combined: semanticResults,
        metadata: {
          vectorResults: semanticResults.length,
          graphResults: 0,
          combinedResults: semanticResults.length,
        },
      };
    }
  }

  /**
   * Convert graph entity to MemoryEntry format
   */
  private convertGraphToMemory(graphEntity: any): TypeMemoryEntry {
    const node = graphEntity.node || graphEntity;
    const label = graphEntity.label || 'Entity';

    return {
      id: `graph-${node.normalized}`,
      userId: 'system',
      content: `${label}: ${node.name}`,
      metadata: {
        source: 'graph',
        entity: node,
        label,
      },
      createdAt: node.firstSeen || new Date(),
    };
  }


  /**
   * Get all memories for a user
   * Returns recent memories from pgvector
   */
  async getAll(
    userId: string,
    options: {
      limit?: number;
      conversationId?: string;
    } = {}
  ): Promise<TypeMemoryEntry[]> {
    try {
      const dbResults = await vectorOps.getRecent(userId, {
        limit: options.limit || 100,
        conversationId: options.conversationId,
        excludeDeleted: true,
      });

      console.log(`[Memory] Retrieved ${dbResults.length} recent memories for user ${userId}`);

      return dbResults.map((result) => ({
        id: result.id,
        userId: result.userId,
        content: result.content,
        metadata: {
          ...result.metadata,
          importance: result.importance,
          accessCount: result.accessCount,
          summary: result.summary,
        },
        createdAt: result.createdAt,
      }));
    } catch (error) {
      console.error('[Memory] Error getting all memories:', error);
      return [];
    }
  }

  /**
   * Get memory by ID
   */
  async getById(memoryId: string): Promise<TypeMemoryEntry | null> {
    try {
      const dbEntry = await vectorOps.getById(memoryId, true);

      if (!dbEntry) {
        return null;
      }

      return {
        id: dbEntry.id,
        userId: dbEntry.userId,
        content: dbEntry.content,
        metadata: {
          ...dbEntry.metadata,
          importance: dbEntry.importance,
          accessCount: dbEntry.accessCount,
          summary: dbEntry.summary,
        },
        createdAt: dbEntry.createdAt,
      };
    } catch (error) {
      console.error('[Memory] Error getting memory by ID:', error);
      return null;
    }
  }

  /**
   * Get memory statistics for a user
   */
  async getStats(userId: string): Promise<{
    total: number;
    byConversation: Record<string, number>;
    avgImportance: number;
    totalAccesses: number;
  }> {
    try {
      return await vectorOps.getStats(userId);
    } catch (error) {
      console.error('[Memory] Error getting stats:', error);
      return {
        total: 0,
        byConversation: {},
        avgImportance: 0,
        totalAccesses: 0,
      };
    }
  }

  /**
   * Delete a memory (soft delete by default)
   */
  async delete(memoryId: string, hard: boolean = false): Promise<void> {
    try {
      await vectorOps.deleteVector(memoryId, hard);

      // Also delete from Mem0 if configured
      if (this.mem0 && this.config.enableGraph) {
        try {
          await this.mem0.delete(memoryId);
        } catch (error) {
          console.error('[Memory] Error deleting from Mem0 (non-fatal):', error);
        }
      }

      console.log(`[Memory] Deleted memory ${memoryId} (hard: ${hard})`);
    } catch (error) {
      console.error('[Memory] Error deleting memory:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const memoryService = new MemoryService();
