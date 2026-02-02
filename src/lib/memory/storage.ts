/**
 * Memory Storage in Weaviate
 *
 * Store and manage memories in Weaviate with semantic search capabilities.
 * Memories are stored with decay parameters for temporal relevance.
 */

import weaviate from 'weaviate-client';
import { getWeaviateClient, ensureTenant } from '../weaviate/client';
import type {
  Memory,
  CreateMemoryInput,
  MemoryCategory,
  MemorySource,
} from './types';
import { DECAY_RATES, DEFAULT_IMPORTANCE } from './types';
import { calculateMemoryStrength } from './decay';

const LOG_PREFIX = '[MemoryStorage]';
const MEMORY_COLLECTION = 'Memory';

/**
 * Weaviate memory object (stored format)
 */
interface WeaviateMemory {
  id: string;
  userId: string;
  content: string;
  category: string;
  sourceType: string;
  sourceId: string;
  sourceDate: string; // ISO string
  importance: number;
  decayRate: number;
  lastAccessed: string; // ISO string
  expiresAt: string | null; // ISO string or null
  confidence: number;
  relatedEntities: string; // JSON string
  tags: string; // JSON string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  isDeleted: boolean;
}

/**
 * Initialize Memory collection in Weaviate
 */
export async function initializeMemorySchema(): Promise<void> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Initializing Memory schema...`);

  try {
    // Check if collection exists
    const exists = await client.collections.exists(MEMORY_COLLECTION);

    if (exists) {
      console.log(`${LOG_PREFIX} Memory collection already exists`);
      return;
    }

    // Create Memory collection with vectorization for semantic search and multi-tenancy enabled
    await client.collections.create({
      name: MEMORY_COLLECTION,
      description: 'User memories with temporal decay',
      properties: [
        { name: 'userId', dataType: 'text', description: 'User ID who owns this memory' },
        { name: 'content', dataType: 'text', description: 'Memory content' },
        { name: 'category', dataType: 'text', description: 'Memory category' },
        { name: 'sourceType', dataType: 'text', description: 'Source type (email, calendar, etc.)' },
        { name: 'sourceId', dataType: 'text', description: 'Source ID' },
        { name: 'sourceDate', dataType: 'text', description: 'ISO date when memory was observed' },
        { name: 'importance', dataType: 'number', description: 'Importance rating (0-1)' },
        { name: 'decayRate', dataType: 'number', description: 'Decay rate per day' },
        { name: 'lastAccessed', dataType: 'text', description: 'ISO date of last access' },
        { name: 'expiresAt', dataType: 'text', description: 'ISO date of expiration (nullable)' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'relatedEntities', dataType: 'text', description: 'JSON array of related entity names' },
        { name: 'tags', dataType: 'text', description: 'JSON array of tags' },
        { name: 'createdAt', dataType: 'text', description: 'ISO date of creation' },
        { name: 'updatedAt', dataType: 'text', description: 'ISO date of last update' },
        { name: 'isDeleted', dataType: 'boolean', description: 'Soft delete flag' },
      ],
      multiTenancy: weaviate.configure.multiTenancy({ enabled: true }),
    });

    console.log(`${LOG_PREFIX} Created Memory collection`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create Memory collection:`, error);
    throw error;
  }
}

/**
 * Save a memory to Weaviate
 */
export async function saveMemory(input: CreateMemoryInput): Promise<Memory> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, input.userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(input.userId);

  // Get decay rate for category
  const decayRate = DECAY_RATES[input.category];

  // Set default importance if not provided
  const importance = input.importance ?? DEFAULT_IMPORTANCE[input.category];

  const now = new Date();
  const sourceDate = input.sourceDate || now;

  // Don't include 'id' field - Weaviate will assign it
  const memoryData = {
    userId: input.userId,
    content: input.content,
    category: input.category,
    sourceType: input.sourceType,
    sourceId: input.sourceId || '',
    sourceDate: sourceDate.toISOString(),
    importance,
    decayRate,
    lastAccessed: now.toISOString(),
    expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    confidence: input.confidence ?? 0.8,
    relatedEntities: JSON.stringify(input.relatedEntities || []),
    tags: JSON.stringify(input.tags || []),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    isDeleted: false,
  };

  try {
    const result = await tenantCollection.data.insert(memoryData);

    console.log(`${LOG_PREFIX} Saved memory ${result} for user ${input.userId} (tenant)`);

    return {
      id: result as string,
      userId: input.userId,
      content: input.content,
      category: input.category,
      sourceType: input.sourceType,
      sourceId: input.sourceId || '',
      sourceDate,
      importance,
      decayRate,
      lastAccessed: now,
      expiresAt: input.expiresAt,
      confidence: input.confidence ?? 0.8,
      relatedEntities: input.relatedEntities,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save memory:`, error);
    throw error;
  }
}

/**
 * Save multiple memories in batch
 * Note: All inputs must be for the same user (same tenant)
 */
export async function saveMemories(inputs: CreateMemoryInput[]): Promise<Memory[]> {
  if (inputs.length === 0) {
    console.log(`${LOG_PREFIX} No memories to save`);
    return [];
  }

  // All inputs must be for the same user
  const userId = inputs[0].userId;
  if (inputs.some(input => input.userId !== userId)) {
    throw new Error('saveMemories: All inputs must be for the same user');
  }

  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  console.log(`${LOG_PREFIX} Saving ${inputs.length} memories...`);

  const now = new Date();

  const objects = inputs.map((input) => {
    const decayRate = DECAY_RATES[input.category];
    const importance = input.importance ?? DEFAULT_IMPORTANCE[input.category];
    const sourceDate = input.sourceDate || now;

    return {
      userId: input.userId,
      content: input.content,
      category: input.category,
      sourceType: input.sourceType,
      sourceId: input.sourceId || '',
      sourceDate: sourceDate.toISOString(),
      importance,
      decayRate,
      lastAccessed: now.toISOString(),
      expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
      confidence: input.confidence ?? 0.8,
      relatedEntities: JSON.stringify(input.relatedEntities || []),
      tags: JSON.stringify(input.tags || []),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      isDeleted: false,
    };
  });

  try {
    const result = await tenantCollection.data.insertMany(objects);

    // Extract UUIDs (result.uuids is an object/dictionary)
    const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;

    console.log(`${LOG_PREFIX} Saved ${insertedCount} memories (tenant: ${userId})`);

    // Return Memory objects (approximate - we don't have actual UUIDs back easily)
    return inputs.map((input, index) => {
      const decayRate = DECAY_RATES[input.category];
      const importance = input.importance ?? DEFAULT_IMPORTANCE[input.category];
      const sourceDate = input.sourceDate || now;

      return {
        id: `batch-${index}`, // Placeholder ID
        userId: input.userId,
        content: input.content,
        category: input.category,
        sourceType: input.sourceType,
        sourceId: input.sourceId || '',
        sourceDate,
        importance,
        decayRate,
        lastAccessed: now,
        expiresAt: input.expiresAt,
        confidence: input.confidence ?? 0.8,
        relatedEntities: input.relatedEntities,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save memories:`, error);
    throw error;
  }
}

/**
 * Get memory by ID
 * Requires userId for tenant isolation
 */
export async function getMemoryById(memoryId: string, userId: string): Promise<Memory | null> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    const result = await tenantCollection.query.fetchObjectById(memoryId);

    if (!result || !result.properties) {
      return null;
    }

    const props = result.properties as Record<string, any>;

    return {
      id: result.uuid as string,
      userId: props.userId,
      content: props.content,
      category: props.category as MemoryCategory,
      sourceType: props.sourceType as MemorySource,
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
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get memory ${memoryId}:`, error);
    return null;
  }
}

/**
 * Update memory's lastAccessed timestamp (refresh decay clock)
 * Requires userId for tenant isolation
 */
export async function refreshMemoryAccess(memoryId: string, userId: string): Promise<void> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  const now = new Date().toISOString();

  try {
    await tenantCollection.data.update({
      id: memoryId,
      properties: {
        lastAccessed: now,
        updatedAt: now,
      },
    });

    console.log(`${LOG_PREFIX} Refreshed memory ${memoryId} (tenant: ${userId})`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to refresh memory ${memoryId}:`, error);
  }
}

/**
 * Soft delete a memory
 * Requires userId for tenant isolation
 */
export async function deleteMemory(memoryId: string, userId: string): Promise<void> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    await tenantCollection.data.update({
      id: memoryId,
      properties: {
        isDeleted: true,
        updatedAt: new Date().toISOString(),
      },
    });

    console.log(`${LOG_PREFIX} Deleted memory ${memoryId} (tenant: ${userId})`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete memory ${memoryId}:`, error);
    throw error;
  }
}

/**
 * Hard delete a memory
 * Requires userId for tenant isolation
 */
export async function hardDeleteMemory(memoryId: string, userId: string): Promise<void> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    await tenantCollection.data.deleteById(memoryId);
    console.log(`${LOG_PREFIX} Hard deleted memory ${memoryId} (tenant: ${userId})`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to hard delete memory ${memoryId}:`, error);
    throw error;
  }
}

/**
 * Get all memories for a user (for export/analysis)
 */
export async function getAllMemories(userId: string): Promise<Memory[]> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(MEMORY_COLLECTION, userId);

  const collection = client.collections.get(MEMORY_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    const result = await tenantCollection.query.fetchObjects({
      limit: 10000,
    });

    // Filter by isDeleted only (tenant isolation handles userId)
    const memories: Memory[] = result.objects
      .filter((obj: any) => !obj.properties.isDeleted)
      .map((obj: any) => {
        const props = obj.properties as WeaviateMemory;

        return {
          id: obj.uuid as string,
          userId: props.userId,
          content: props.content,
          category: props.category as MemoryCategory,
          sourceType: props.sourceType as MemorySource,
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
      });

    console.log(`${LOG_PREFIX} Retrieved ${memories.length} memories for user ${userId}`);
    return memories;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get all memories:`, error);
    return [];
  }
}

/**
 * Get memory statistics for a user
 */
export async function getMemoryStats(userId: string): Promise<{
  total: number;
  byCategory: Record<MemoryCategory, number>;
  bySource: Record<MemorySource, number>;
}> {
  const memories = await getAllMemories(userId);

  const stats = {
    total: memories.length,
    byCategory: {
      preference: 0,
      fact: 0,
      event: 0,
      decision: 0,
      sentiment: 0,
      reminder: 0,
      relationship: 0,
    } as Record<MemoryCategory, number>,
    bySource: {
      email: 0,
      calendar: 0,
      chat: 0,
      manual: 0,
    } as Record<MemorySource, number>,
  };

  for (const memory of memories) {
    stats.byCategory[memory.category]++;
    stats.bySource[memory.sourceType]++;
  }

  return stats;
}
