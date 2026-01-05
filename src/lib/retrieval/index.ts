/**
 * Hybrid Retrieval Service
 *
 * Optimized retrieval combining vector similarity and graph traversal.
 * Features:
 * - Smart query parsing with intent detection
 * - Weighted ranking system
 * - Parallel execution of vector and graph queries
 * - Result deduplication and merging
 * - Query result caching
 * - Performance target: <500ms P95 latency
 */

import { embeddingService } from '@/lib/embeddings';
import { vectorOps } from '@/lib/db/vectors';
import { searchEntities, getRelatedEntities } from '@/lib/graph';
import { parseQuery, suggestStrategy } from './parser';
import {
  rankVectorResults,
  rankGraphResults,
  mergeAndRank,
  getTopResults,
  filterByThreshold,
  DEFAULT_WEIGHTS,
} from './ranker';
import { retrievalCache } from './cache';
import type {
  RetrievalConfig,
  RetrievalResult,
  RetrievalWeights,
  ParsedQuery,
} from './types';

/**
 * Default retrieval configuration
 */
const DEFAULT_CONFIG: Required<RetrievalConfig> = {
  weights: DEFAULT_WEIGHTS,
  vectorLimit: 20,
  graphLimit: 10,
  finalLimit: 10,
  vectorThreshold: 0.6,
  cacheEnabled: true,
  cacheTTL: 300, // 5 minutes
  parallelExecution: true,
};

/**
 * Hybrid Retrieval Service
 */
export class RetrievalService {
  private config: Required<RetrievalConfig>;

  constructor(config: Partial<RetrievalConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_WEIGHTS,
        ...config.weights,
      },
    };
  }

  /**
   * Main search method - hybrid retrieval
   *
   * @param userId - User ID for personalized results
   * @param query - Natural language query
   * @param options - Additional search options
   * @returns Ranked retrieval results
   */
  async search(
    userId: string,
    query: string,
    options: {
      conversationId?: string;
      limit?: number;
      includeGraph?: boolean;
      forceRefresh?: boolean;
    } = {}
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    // Check cache first
    if (this.config.cacheEnabled && !options.forceRefresh) {
      const cached = retrievalCache.get(query, userId);
      if (cached) {
        cached.metadata.cacheHit = true;
        return cached;
      }
    }

    // 1. Parse query
    const parsedQuery = parseQuery(query);
    console.log(
      `[Retrieval] Parsed query (type: ${parsedQuery.type}, confidence: ${parsedQuery.confidence.toFixed(2)})`
    );

    // 2. Suggest retrieval strategy based on query type
    const strategy = suggestStrategy(parsedQuery);
    const weights: RetrievalWeights = {
      ...this.config.weights,
      vector: strategy.vectorWeight,
      graph: strategy.graphWeight,
      recency: strategy.useRecencyBoost
        ? (this.config.weights?.recency ?? DEFAULT_WEIGHTS.recency) * 1.5
        : (this.config.weights?.recency ?? DEFAULT_WEIGHTS.recency),
      importance: this.config.weights?.importance ?? DEFAULT_WEIGHTS.importance,
      entityOverlap: this.config.weights?.entityOverlap ?? DEFAULT_WEIGHTS.entityOverlap,
    };

    // 3. Execute vector and graph queries in parallel
    const includeGraph = options.includeGraph ?? true;

    let vectorResults, graphResults;

    if (this.config.parallelExecution) {
      [vectorResults, graphResults] = await Promise.all([
        this.executeVectorSearch(userId, parsedQuery, options),
        includeGraph
          ? this.executeGraphSearch(parsedQuery)
          : Promise.resolve([]),
      ]);
    } else {
      vectorResults = await this.executeVectorSearch(userId, parsedQuery, options);
      graphResults = includeGraph
        ? await this.executeGraphSearch(parsedQuery)
        : [];
    }

    // 4. Rank results
    const rankedVector = rankVectorResults(vectorResults, parsedQuery, weights);
    const rankedGraph = rankGraphResults(graphResults, parsedQuery, weights);

    // 5. Merge and re-rank
    const merged = mergeAndRank(rankedVector, rankedGraph, weights);

    // 6. Apply threshold filter and limit
    const filtered = filterByThreshold(merged, this.config.vectorThreshold);
    const finalResults = getTopResults(
      filtered,
      options.limit || this.config.finalLimit
    );

    const executionTime = Date.now() - startTime;

    const result: RetrievalResult = {
      query: parsedQuery,
      results: finalResults,
      metadata: {
        vectorResults: vectorResults.length,
        graphResults: graphResults.length,
        totalCandidates: merged.length,
        finalResults: finalResults.length,
        executionTime,
        weights,
      },
    };

    // Cache result
    if (this.config.cacheEnabled) {
      retrievalCache.set(query, userId, result);
    }

    console.log(
      `[Retrieval] Completed in ${executionTime}ms (vector: ${vectorResults.length}, graph: ${graphResults.length}, final: ${finalResults.length})`
    );

    return result;
  }

  /**
   * Execute vector similarity search
   */
  private async executeVectorSearch(
    userId: string,
    query: ParsedQuery,
    options: { conversationId?: string }
  ) {
    try {
      // Generate embedding for query
      const queryEmbedding =
        await embeddingService.generateEmbeddingWithFallback(query.original);

      // Search similar vectors
      const results = await vectorOps.searchSimilar(queryEmbedding, {
        userId,
        conversationId: options.conversationId,
        limit: this.config.vectorLimit,
        threshold: this.config.vectorThreshold,
        minImportance: 1,
        excludeDeleted: true,
      });

      console.log(`[Retrieval] Vector search: ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[Retrieval] Vector search error:', error);
      return [];
    }
  }

  /**
   * Execute graph entity search
   */
  private async executeGraphSearch(query: ParsedQuery) {
    try {
      const results = [];

      // 1. Search for entities matching query keywords
      for (const keyword of query.keywords.slice(0, 3)) {
        const entities = await searchEntities(
          keyword,
          undefined,
          this.config.graphLimit
        );
        results.push(...entities);
      }

      // 2. Search for extracted entities
      for (const entity of query.entities.slice(0, 2)) {
        const entities = await searchEntities(
          entity,
          undefined,
          this.config.graphLimit
        );
        results.push(...entities);
      }

      // Deduplicate by normalized name (only for entity nodes)
      const uniqueResults = Array.from(
        new Map(
          results.map((r) => {
            const normalized = 'normalized' in r.node ? r.node.normalized : r.node.id || '';
            return [`${r.label}:${normalized}`, r];
          })
        ).values()
      );

      console.log(`[Retrieval] Graph search: ${uniqueResults.length} results`);
      return uniqueResults.slice(0, this.config.graphLimit);
    } catch (error) {
      console.error('[Retrieval] Graph search error:', error);
      return [];
    }
  }

  /**
   * Clear retrieval cache
   */
  clearCache(): void {
    if (this.config.cacheEnabled) {
      retrievalCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return retrievalCache.getStats();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetrievalConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      weights: {
        ...this.config.weights,
        ...config.weights,
      },
    };
  }
}

// Export singleton instance
export const retrievalService = new RetrievalService();

// Re-export types and utilities
export * from './types';
export * from './parser';
export * from './ranker';
export * from './cache';
