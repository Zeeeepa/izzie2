/**
 * Retrieval System Types
 *
 * Type definitions for the hybrid retrieval system
 */

import type { MemoryEntry } from '@/types';
import type { EntityQueryResult } from '@/lib/graph/types';

/**
 * Query types based on semantic analysis
 */
export type QueryType =
  | 'factual' // "What is X?", "Tell me about Y"
  | 'relational' // "Who works with X?", "What's related to Y?"
  | 'temporal' // "Recent updates", "Last week's activity"
  | 'exploratory' // "Show me everything about X"
  | 'semantic'; // General similarity search

/**
 * Parsed query with extracted metadata
 */
export interface ParsedQuery {
  original: string;
  type: QueryType;
  entities: string[]; // Extracted entity names
  keywords: string[]; // Key terms
  intent: string; // Natural language intent
  temporal?: {
    // Time constraints
    from?: Date;
    to?: Date;
    relative?: string; // "recent", "last week", etc.
  };
  confidence: number; // Confidence in parsing (0-1)
}

/**
 * Retrieval strategy weights
 */
export interface RetrievalWeights {
  vector: number; // 0-1, weight for semantic similarity
  graph: number; // 0-1, weight for graph relevance
  recency: number; // Boost factor for recent items
  importance: number; // Boost factor for importance
  entityOverlap: number; // Boost for entity matches
}

/**
 * Ranked result with scoring metadata
 */
export interface RankedResult {
  source: 'vector' | 'graph' | 'hybrid';
  content: MemoryEntry | EntityQueryResult;
  scores: {
    vector?: number; // Cosine similarity score
    graph?: number; // Graph relevance score
    recency?: number; // Recency boost
    importance?: number; // Importance score
    entityOverlap?: number; // Entity overlap score
    combined: number; // Final combined score
  };
  metadata: {
    matchedEntities?: string[];
    matchedKeywords?: string[];
    relevanceReason?: string;
  };
}

/**
 * Retrieval configuration
 */
export interface RetrievalConfig {
  weights?: Partial<RetrievalWeights>;
  vectorLimit?: number; // Max results from vector search
  graphLimit?: number; // Max results from graph search
  finalLimit?: number; // Max final results
  vectorThreshold?: number; // Min similarity for vector results
  cacheEnabled?: boolean;
  cacheTTL?: number; // Cache TTL in seconds
  parallelExecution?: boolean;
}

/**
 * Retrieval result
 */
export interface RetrievalResult {
  query: ParsedQuery;
  results: RankedResult[];
  metadata: {
    vectorResults: number;
    graphResults: number;
    totalCandidates: number;
    finalResults: number;
    executionTime: number;
    cacheHit?: boolean;
    weights: RetrievalWeights;
  };
}

/**
 * Cache entry
 */
export interface CacheEntry {
  query: string;
  userId: string;
  result: RetrievalResult;
  timestamp: number;
  hits: number;
}
