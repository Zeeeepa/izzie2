/**
 * Result Ranker
 *
 * Combines vector similarity scores with graph relevance using weighted ranking.
 * Applies boost factors for recency, importance, and entity overlap.
 */

import type { MemoryEntry } from '@/types';
import type { EntityQueryResult, GraphNode } from '@/lib/graph/types';
import type { VectorSearchResult } from '@/lib/db/vectors';
import type {
  RankedResult,
  RetrievalWeights,
  ParsedQuery,
} from './types';

/**
 * Default retrieval weights
 */
export const DEFAULT_WEIGHTS: RetrievalWeights = {
  vector: 0.6, // 60% weight for semantic similarity
  graph: 0.4, // 40% weight for graph relevance
  recency: 0.15, // 15% boost for recent items
  importance: 0.1, // 10% boost for importance
  entityOverlap: 0.2, // 20% boost for entity matches
};

/**
 * Rank vector search results
 */
export function rankVectorResults(
  results: VectorSearchResult[],
  query: ParsedQuery,
  weights: RetrievalWeights = DEFAULT_WEIGHTS
): RankedResult[] {
  return results.map((result) => {
    const vectorScore = result.similarity || 0;

    // Calculate recency boost (0-1 scale)
    const recencyScore = calculateRecencyScore(result.createdAt);

    // Calculate importance score (normalize 1-10 to 0-1)
    const importanceScore = (result.importance || 5) / 10;

    // Calculate entity overlap
    const entityOverlap = calculateEntityOverlap(
      result.content,
      query.entities
    );

    // Combined score with weights
    const combinedScore =
      vectorScore * weights.vector +
      recencyScore * weights.recency +
      importanceScore * weights.importance +
      entityOverlap * weights.entityOverlap;

    return {
      source: 'vector' as const,
      content: convertToMemoryEntry(result),
      scores: {
        vector: vectorScore,
        recency: recencyScore,
        importance: importanceScore,
        entityOverlap,
        combined: combinedScore,
      },
      metadata: {
        matchedEntities: findMatchedEntities(result.content, query.entities),
        matchedKeywords: findMatchedKeywords(result.content, query.keywords),
        relevanceReason: generateRelevanceReason(
          vectorScore,
          recencyScore,
          entityOverlap
        ),
      },
    };
  });
}

/**
 * Rank graph search results
 */
export function rankGraphResults(
  results: EntityQueryResult[],
  query: ParsedQuery,
  weights: RetrievalWeights = DEFAULT_WEIGHTS
): RankedResult[] {
  return results.map((result) => {
    const node = result.node;

    // Graph relevance based on frequency and entity matches
    const graphScore = calculateGraphScore(node, query);

    // Entity overlap (graph entities are inherently entity-focused)
    const entityName = 'name' in node ? node.name : '';
    const entityOverlap = query.entities.some(
      (e) => e.toLowerCase() === entityName.toLowerCase()
    )
      ? 1.0
      : 0.5;

    // Recency score (if lastSeen available on entity nodes)
    const recencyScore =
      'lastSeen' in node && node.lastSeen
        ? calculateRecencyScore(node.lastSeen)
        : 0.5;

    // Combined score
    const combinedScore =
      graphScore * weights.graph +
      recencyScore * weights.recency +
      entityOverlap * weights.entityOverlap;

    return {
      source: 'graph' as const,
      content: result,
      scores: {
        graph: graphScore,
        recency: recencyScore,
        entityOverlap,
        combined: combinedScore,
      },
      metadata: {
        matchedEntities: entityName ? [entityName] : [],
        relevanceReason: `Graph entity: ${entityName || 'Unknown'} (${result.label})`,
      },
    };
  });
}

/**
 * Merge and re-rank combined results
 */
export function mergeAndRank(
  vectorResults: RankedResult[],
  graphResults: RankedResult[],
  weights: RetrievalWeights = DEFAULT_WEIGHTS
): RankedResult[] {
  const allResults = [...vectorResults, ...graphResults];

  // Deduplicate by content similarity
  const deduped = deduplicateResults(allResults);

  // Sort by combined score
  deduped.sort((a, b) => b.scores.combined - a.scores.combined);

  // Apply final re-ranking based on diversity
  return applyDiversityBoost(deduped);
}

/**
 * Calculate recency score (0-1 scale)
 * More recent items get higher scores
 */
function calculateRecencyScore(date: Date): number {
  const now = Date.now();
  const itemTime = new Date(date).getTime();
  const ageInDays = (now - itemTime) / (1000 * 60 * 60 * 24);

  // Decay curve: 1.0 for today, 0.5 for 30 days ago, 0.1 for 90 days+
  if (ageInDays < 1) return 1.0;
  if (ageInDays < 7) return 0.9;
  if (ageInDays < 30) return 0.7;
  if (ageInDays < 90) return 0.5;
  return 0.3;
}

/**
 * Calculate entity overlap score
 */
function calculateEntityOverlap(
  content: string,
  entities: string[]
): number {
  if (entities.length === 0) return 0;

  const contentLower = content.toLowerCase();
  const matches = entities.filter((e) =>
    contentLower.includes(e.toLowerCase())
  );

  return matches.length / entities.length;
}

/**
 * Calculate graph relevance score
 */
function calculateGraphScore(
  node: GraphNode,
  query: ParsedQuery
): number {
  // Only entity nodes have name/frequency
  if (!('name' in node)) {
    return 0.5; // Default score for Email/Document nodes
  }

  // Base score from frequency (normalize to 0-1)
  const freqScore = node.frequency
    ? Math.min(node.frequency / 100, 1.0)
    : 0.5;

  // Name match bonus
  const nameMatch = query.keywords.some((k) =>
    node.name.toLowerCase().includes(k)
  )
    ? 0.3
    : 0;

  return freqScore * 0.7 + nameMatch * 0.3;
}

/**
 * Find matched entities in content
 */
function findMatchedEntities(
  content: string,
  entities: string[]
): string[] {
  const contentLower = content.toLowerCase();
  return entities.filter((e) => contentLower.includes(e.toLowerCase()));
}

/**
 * Find matched keywords in content
 */
function findMatchedKeywords(
  content: string,
  keywords: string[]
): string[] {
  const contentLower = content.toLowerCase();
  return keywords.filter((k) => contentLower.includes(k));
}

/**
 * Generate human-readable relevance reason
 */
function generateRelevanceReason(
  vectorScore: number,
  recencyScore: number,
  entityOverlap: number
): string {
  const reasons: string[] = [];

  if (vectorScore > 0.8) {
    reasons.push('Highly similar content');
  } else if (vectorScore > 0.6) {
    reasons.push('Semantically related');
  }

  if (recencyScore > 0.8) {
    reasons.push('Recent activity');
  }

  if (entityOverlap > 0.5) {
    reasons.push('Matching entities');
  }

  return reasons.length > 0 ? reasons.join(', ') : 'Relevant match';
}

/**
 * Deduplicate results based on content similarity
 */
function deduplicateResults(results: RankedResult[]): RankedResult[] {
  const seen = new Set<string>();
  const deduped: RankedResult[] = [];

  for (const result of results) {
    let key: string;

    if ('userId' in result.content) {
      // MemoryEntry
      const entry = result.content as MemoryEntry;
      key = entry.id || entry.content.substring(0, 50);
    } else {
      // EntityQueryResult
      const entity = result.content as EntityQueryResult;
      const nodeName = 'name' in entity.node ? entity.node.name : entity.node.id || 'unknown';
      key = `${entity.label}:${nodeName}`;
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(result);
    }
  }

  return deduped;
}

/**
 * Apply diversity boost to avoid too many similar results
 * Slightly boost results from different sources/types
 */
function applyDiversityBoost(results: RankedResult[]): RankedResult[] {
  const boosted = [...results];
  const sourceCount: Record<string, number> = {
    vector: 0,
    graph: 0,
  };

  for (let i = 0; i < boosted.length; i++) {
    const result = boosted[i];
    const source = result.source;

    // Apply small penalty for over-representation
    if (sourceCount[source] > 3) {
      boosted[i].scores.combined *= 0.95;
    }

    sourceCount[source]++;
  }

  // Re-sort after diversity boost
  boosted.sort((a, b) => b.scores.combined - a.scores.combined);

  return boosted;
}

/**
 * Convert VectorSearchResult to MemoryEntry
 */
function convertToMemoryEntry(result: VectorSearchResult): MemoryEntry {
  return {
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
  };
}

/**
 * Get top N results
 */
export function getTopResults(
  results: RankedResult[],
  limit: number
): RankedResult[] {
  return results.slice(0, limit);
}

/**
 * Filter results by minimum score threshold
 */
export function filterByThreshold(
  results: RankedResult[],
  threshold: number
): RankedResult[] {
  return results.filter((r) => r.scores.combined >= threshold);
}
