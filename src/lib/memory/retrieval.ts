/**
 * Memory Retrieval
 *
 * Search and retrieve memories with decay-weighted relevance.
 * Combines semantic search with temporal decay for context-aware memory access.
 */

import { getWeaviateClient } from '../weaviate/client';
import type { Memory, MemorySearchOptions, MemoryWithStrength, MemoryCategory } from './types';
import { addStrengthToMemory, rankMemoriesByRelevance, filterByStrength } from './decay';
import { refreshMemoryAccess } from './storage';

const LOG_PREFIX = '[MemoryRetrieval]';
const MEMORY_COLLECTION = 'Memory';

/**
 * Weaviate memory object (stored format)
 */
interface WeaviateMemory {
  userId: string;
  content: string;
  category: string;
  sourceType: string;
  sourceId: string;
  sourceDate: string;
  importance: number;
  decayRate: number;
  lastAccessed: string;
  expiresAt: string | null;
  confidence: number;
  relatedEntities: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

/**
 * Convert Weaviate object to Memory
 */
function weaviateToMemory(obj: any): Memory {
  const props = obj.properties as WeaviateMemory;

  return {
    id: obj.uuid as string,
    userId: props.userId,
    content: props.content,
    category: props.category as MemoryCategory,
    sourceType: props.sourceType as any,
    sourceId: props.sourceId,
    sourceDate: new Date(props.sourceDate),
    importance: props.importance,
    decayRate: props.decayRate,
    lastAccessed: props.lastAccessed ? new Date(props.lastAccessed) : undefined,
    expiresAt: props.expiresAt ? new Date(props.expiresAt) : undefined,
    confidence: props.confidence,
    relatedEntities: JSON.parse(props.relatedEntities || '[]'),
    tags: JSON.parse(props.tags || '[]'),
    createdAt: new Date(props.createdAt),
    updatedAt: new Date(props.updatedAt),
    isDeleted: props.isDeleted,
  };
}

/**
 * Search memories using keyword search (BM25)
 */
export async function searchMemories(
  options: MemorySearchOptions
): Promise<MemoryWithStrength[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(MEMORY_COLLECTION);

  console.log(`${LOG_PREFIX} Searching memories for: "${options.query}"`);

  try {
    // Use BM25 keyword search
    const result = await collection.query.bm25(options.query, {
      limit: options.limit || 20,
      returnMetadata: ['score'],
    });

    // Filter results
    let memories: Memory[] = result.objects
      .filter((obj: any) => {
        const props = obj.properties as WeaviateMemory;

        // Must match userId
        if (props.userId !== options.userId) return false;

        // Must not be deleted (unless explicitly requested)
        if (props.isDeleted && !options.includeExpired) return false;

        // Filter by categories
        if (options.categories && !options.categories.includes(props.category as any)) {
          return false;
        }

        // Filter by source type
        if (options.sourceType && props.sourceType !== options.sourceType) {
          return false;
        }

        // Filter by related entity
        if (options.relatedEntity) {
          const entities = JSON.parse(props.relatedEntities || '[]');
          if (!entities.includes(options.relatedEntity)) return false;
        }

        // Filter by tags
        if (options.tags && options.tags.length > 0) {
          const memoryTags = JSON.parse(props.tags || '[]');
          const hasTag = options.tags.some((tag) => memoryTags.includes(tag));
          if (!hasTag) return false;
        }

        return true;
      })
      .map(weaviateToMemory);

    console.log(`${LOG_PREFIX} Found ${memories.length} matching memories`);

    // Add strength calculations
    let memoriesWithStrength = memories.map(addStrengthToMemory);

    // Filter by minimum importance
    if (options.minImportance !== undefined) {
      memoriesWithStrength = memoriesWithStrength.filter(
        (m) => m.importance >= options.minImportance!
      );
      console.log(
        `${LOG_PREFIX} Filtered to ${memoriesWithStrength.length} memories above importance threshold ${options.minImportance}`
      );
    }

    // Filter by minimum strength (decay threshold)
    if (options.minStrength !== undefined) {
      memoriesWithStrength = memoriesWithStrength.filter(
        (m) => m.strength >= options.minStrength!
      );
      console.log(
        `${LOG_PREFIX} Filtered to ${memoriesWithStrength.length} memories above strength threshold ${options.minStrength}`
      );
    }

    // Filter by minimum confidence
    if (options.minConfidence !== undefined) {
      memoriesWithStrength = memoriesWithStrength.filter(
        (m) => m.confidence >= options.minConfidence!
      );
      console.log(
        `${LOG_PREFIX} Filtered to ${memoriesWithStrength.length} memories above confidence threshold ${options.minConfidence}`
      );
    }

    // Check for expired memories (hard expiration)
    const now = new Date();
    memoriesWithStrength = memoriesWithStrength.filter((m) => {
      if (!m.expiresAt) return true;
      return now <= m.expiresAt;
    });

    // Sort by decay-weighted relevance
    const rankedMemories = rankMemoriesByRelevance(
      memoriesWithStrength.map((m) => {
        // Remove strength properties to match Memory type
        const { strength, ageInDays, daysSinceAccess, ...memory } = m;
        return memory;
      })
    );

    console.log(`${LOG_PREFIX} Returning ${rankedMemories.length} ranked memories`);

    // Refresh access timestamps for top results (to reinforce frequently accessed memories)
    const topMemories = rankedMemories.slice(0, Math.min(5, rankedMemories.length));
    await Promise.all(topMemories.map((m) => refreshMemoryAccess(m.id)));

    return rankedMemories;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error searching memories:`, error);
    return [];
  }
}

/**
 * Get recent memories for a user
 */
export async function getRecentMemories(
  userId: string,
  options?: {
    limit?: number;
    categories?: MemoryCategory[];
    minStrength?: number;
  }
): Promise<MemoryWithStrength[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(MEMORY_COLLECTION);

  console.log(`${LOG_PREFIX} Getting recent memories for user ${userId}`);

  try {
    const result = await collection.query.fetchObjects({
      limit: options?.limit || 50,
    });

    // Filter and convert
    const memories: Memory[] = result.objects
      .filter((obj: any) => {
        const props = obj.properties as WeaviateMemory;

        // Must match userId
        if (props.userId !== userId) return false;

        // Must not be deleted
        if (props.isDeleted) return false;

        // Filter by categories
        if (options?.categories && !options.categories.includes(props.category as any)) {
          return false;
        }

        return true;
      })
      .map(weaviateToMemory);

    // Add strength and filter
    let memoriesWithStrength = memories.map(addStrengthToMemory);

    if (options?.minStrength !== undefined) {
      memoriesWithStrength = memoriesWithStrength.filter(
        (m) => m.strength >= options.minStrength!
      );
    }

    // Sort by creation date (newest first)
    memoriesWithStrength.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    console.log(`${LOG_PREFIX} Returning ${memoriesWithStrength.length} recent memories`);

    return memoriesWithStrength;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting recent memories:`, error);
    return [];
  }
}

/**
 * Get memories by category
 */
export async function getMemoriesByCategory(
  userId: string,
  category: MemoryCategory,
  options?: {
    limit?: number;
    minStrength?: number;
  }
): Promise<MemoryWithStrength[]> {
  return getRecentMemories(userId, {
    limit: options?.limit,
    categories: [category],
    minStrength: options?.minStrength,
  });
}

/**
 * Get memories related to a specific entity
 */
export async function getMemoriesByEntity(
  userId: string,
  entityName: string,
  options?: {
    limit?: number;
    minStrength?: number;
  }
): Promise<MemoryWithStrength[]> {
  return searchMemories({
    query: entityName,
    userId,
    relatedEntity: entityName,
    limit: options?.limit || 20,
    minStrength: options?.minStrength,
  });
}

/**
 * Get memories by tags
 */
export async function getMemoriesByTags(
  userId: string,
  tags: string[],
  options?: {
    limit?: number;
    minStrength?: number;
  }
): Promise<MemoryWithStrength[]> {
  return searchMemories({
    query: tags.join(' '),
    userId,
    tags,
    limit: options?.limit || 20,
    minStrength: options?.minStrength,
  });
}

/**
 * Get memories from a specific source
 */
export async function getMemoriesBySource(
  userId: string,
  sourceId: string
): Promise<MemoryWithStrength[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(MEMORY_COLLECTION);

  try {
    const result = await collection.query.fetchObjects({
      limit: 1000,
    });

    // Filter by userId and sourceId
    const memories: Memory[] = result.objects
      .filter((obj: any) => {
        const props = obj.properties as WeaviateMemory;
        return props.userId === userId && props.sourceId === sourceId && !props.isDeleted;
      })
      .map(weaviateToMemory);

    const memoriesWithStrength = memories.map(addStrengthToMemory);

    console.log(
      `${LOG_PREFIX} Found ${memoriesWithStrength.length} memories from source ${sourceId}`
    );

    return memoriesWithStrength;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting memories by source:`, error);
    return [];
  }
}
