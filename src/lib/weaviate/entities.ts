/**
 * Entity Storage Functions
 *
 * Save, search, and manage extracted entities in Weaviate.
 */

import { getWeaviateClient, ensureTenant } from './client';
import { COLLECTIONS } from './schema';
import type { Entity, EntityType } from '../extraction/types';

const LOG_PREFIX = '[Weaviate Entities]';

/**
 * Save entities to Weaviate
 */
export async function saveEntities(
  entities: Entity[],
  userId: string,
  sourceId: string
): Promise<void> {
  if (entities.length === 0) {
    console.log(`${LOG_PREFIX} No entities to save`);
    return;
  }

  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Saving ${entities.length} entities for user ${userId}...`);

  // Group entities by type
  const entitiesByType = entities.reduce(
    (acc, entity) => {
      if (!acc[entity.type]) {
        acc[entity.type] = [];
      }
      acc[entity.type].push(entity);
      return acc;
    },
    {} as Record<EntityType, Entity[]>
  );

  // Insert entities for each type
  let totalSaved = 0;

  for (const [entityType, typeEntities] of Object.entries(entitiesByType)) {
    const collectionName = COLLECTIONS[entityType as EntityType];
    if (!collectionName) {
      console.warn(`${LOG_PREFIX} Unknown entity type: ${entityType}`);
      continue;
    }

    try {
      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      // Get tenant-specific collection handle
      const tenantCollection = collection.withTenant(userId);

      // Prepare objects for insertion
      const objects = typeEntities.map((entity) => ({
        value: entity.value,
        normalized: entity.normalized,
        confidence: entity.confidence,
        source: entity.source,
        sourceId,
        userId,
        extractedAt: new Date().toISOString(),
        context: entity.context || '',
        // Action item specific fields
        ...(entity.type === 'action_item' && {
          assignee: entity.assignee || '',
          deadline: entity.deadline || '',
          priority: entity.priority || 'medium',
        }),
      }));

      // Batch insert to tenant-specific collection
      const result = await tenantCollection.data.insertMany(objects);

      // Count successful inserts (uuids is an object/dictionary, not an array)
      const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;
      console.log(
        `${LOG_PREFIX} Saved ${insertedCount} ${entityType} entities to collection '${collectionName}' (tenant: ${userId})`
      );
      totalSaved += insertedCount;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to save ${entityType} entities:`, error);
      throw error;
    }
  }

  console.log(`${LOG_PREFIX} Successfully saved ${totalSaved} total entities`);
}

/**
 * Search entities using keyword search (no vectorizer needed)
 */
export async function searchEntities(
  query: string,
  userId: string,
  options?: {
    entityType?: EntityType;
    limit?: number;
    minConfidence?: number;
  }
): Promise<Entity[]> {
  const client = await getWeaviateClient();
  const limit = options?.limit || 20;

  console.log(`${LOG_PREFIX} Searching for: "${query}" (user: ${userId})`);

  // Determine which collections to search
  const collectionsToSearch = options?.entityType
    ? [COLLECTIONS[options.entityType]]
    : Object.values(COLLECTIONS);

  const allResults: Entity[] = [];

  for (const collectionName of collectionsToSearch) {
    try {
      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      // Get tenant-specific collection handle
      const tenantCollection = collection.withTenant(userId);

      // Use BM25 keyword search (no vectorizer needed) on tenant-specific data
      const result = await tenantCollection.query.bm25(query, {
        limit,
        returnMetadata: ['score'],
      });

      // Convert results to Entity objects (no need to filter by userId - tenant isolation handles it)
      const entities: Entity[] = result.objects
        .map((obj: any) => {
          const entityType = Object.entries(COLLECTIONS).find(
            ([_, name]) => name === collectionName
          )?.[0] as EntityType;

          return {
            type: entityType,
            value: obj.properties.value,
            normalized: obj.properties.normalized,
            confidence: obj.properties.confidence,
            source: obj.properties.source as 'metadata' | 'body' | 'subject',
            context: obj.properties.context,
            // Action item specific fields
            ...(entityType === 'action_item' && {
              assignee: obj.properties.assignee,
              deadline: obj.properties.deadline,
              priority: obj.properties.priority as 'low' | 'medium' | 'high',
            }),
          };
        });

      // Filter by confidence if specified
      const filtered = options?.minConfidence
        ? entities.filter((e) => e.confidence >= options.minConfidence!)
        : entities;

      allResults.push(...filtered);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to search collection '${collectionName}':`, error);
    }
  }

  // Deduplicate entities by type + normalized value (or value if no normalized)
  const entityMap = new Map<string, typeof allResults[0]>();

  for (const entity of allResults) {
    // Key by type + normalized value (or value if no normalized)
    const key = `${entity.type}:${(entity.normalized || entity.value).toLowerCase()}`;
    const existing = entityMap.get(key);

    // Keep the one with highest confidence, or first one if equal
    if (!existing || (entity.confidence || 0) > (existing.confidence || 0)) {
      entityMap.set(key, entity);
    }
  }

  const deduplicated = Array.from(entityMap.values());
  console.log(`${LOG_PREFIX} Deduplicated ${allResults.length} → ${deduplicated.length} entities`);
  console.log(`${LOG_PREFIX} Found ${deduplicated.length} matching entities`);
  return deduplicated;
}

/**
 * Get all entities from a specific source (email/event)
 */
export async function getEntitiesBySource(sourceId: string, userId: string): Promise<Entity[]> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Fetching entities for source ${sourceId}...`);

  const allResults: Entity[] = [];

  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      // Get tenant-specific collection handle
      const tenantCollection = collection.withTenant(userId);

      // Base properties for all collections
      const baseProperties = [
        'value',
        'normalized',
        'confidence',
        'source',
        'sourceId',
        'userId',
        'extractedAt',
        'context',
      ];

      // Add action_item specific properties only for ActionItem collection
      const returnProperties =
        entityType === 'action_item'
          ? [...baseProperties, 'assignee', 'deadline', 'priority']
          : baseProperties;

      const result = await tenantCollection.query.fetchObjects({
        limit: 1000,
        returnProperties,
      });

      // Filter by sourceId only (tenant isolation handles userId filtering)
      const entities: Entity[] = result.objects
        .filter((obj: any) => obj.properties.sourceId === sourceId)
        .map((obj: any) => {
          return {
            type: entityType as EntityType,
            value: obj.properties.value,
            normalized: obj.properties.normalized,
            confidence: obj.properties.confidence,
            source: obj.properties.source as 'metadata' | 'body' | 'subject',
            context: obj.properties.context,
            ...(entityType === 'action_item' && {
              assignee: obj.properties.assignee,
              deadline: obj.properties.deadline,
              priority: obj.properties.priority as 'low' | 'medium' | 'high',
            }),
          };
        });

      allResults.push(...entities);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to fetch from collection '${collectionName}':`, error);
    }
  }

  console.log(`${LOG_PREFIX} Found ${allResults.length} entities for source ${sourceId}`);
  return allResults;
}

/**
 * Delete all entities from a specific source
 */
export async function deleteEntitiesBySource(sourceId: string, userId: string): Promise<number> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Deleting entities for source ${sourceId}...`);

  let totalDeleted = 0;

  for (const collectionName of Object.values(COLLECTIONS)) {
    try {
      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      // Get tenant-specific collection handle
      const tenantCollection = collection.withTenant(userId);

      // First, fetch all objects matching the criteria from tenant
      const result = await tenantCollection.query.fetchObjects({
        limit: 1000,
        returnProperties: ['sourceId'],
      });

      // Filter objects to delete by sourceId (tenant isolation handles userId)
      const objectsToDelete = result.objects.filter(
        (obj: any) => obj.properties.sourceId === sourceId
      );

      // Delete each object by UUID
      for (const obj of objectsToDelete) {
        await tenantCollection.data.deleteById(obj.uuid);
        totalDeleted++;
      }

      console.log(
        `${LOG_PREFIX} Deleted ${objectsToDelete.length} entities from '${collectionName}' (tenant: ${userId})`
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to delete from collection '${collectionName}':`, error);
    }
  }

  console.log(`${LOG_PREFIX} Total deleted: ${totalDeleted} entities`);
  return totalDeleted;
}

/**
 * Get entity statistics for a user
 */
export async function getEntityStats(userId: string): Promise<Record<EntityType, number>> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Fetching entity stats for user ${userId}...`);

  const stats: Record<EntityType, number> = {
    person: 0,
    company: 0,
    project: 0,
    tool: 0,
    topic: 0,
    location: 0,
    action_item: 0,
  };

  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      // Get tenant-specific collection handle
      const tenantCollection = collection.withTenant(userId);

      const result = await tenantCollection.aggregate.overAll();

      stats[entityType as EntityType] = result.totalCount || 0;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to get stats for '${collectionName}':`, error);
    }
  }

  console.log(`${LOG_PREFIX} Stats:`, stats);
  return stats;
}

/**
 * List all entities of a specific type for a user
 * @param userId - User ID for tenant isolation (required for multi-tenancy)
 */
export async function listEntitiesByType(
  userId: string,
  entityType: EntityType,
  limit: number = 500
): Promise<(Entity & { sourceId?: string; extractedAt?: string })[]> {
  const client = await getWeaviateClient();
  const collectionName = COLLECTIONS[entityType];

  if (!collectionName) {
    console.warn(`${LOG_PREFIX} Unknown entity type: ${entityType}`);
    return [];
  }

  console.log(`${LOG_PREFIX} Listing ${entityType} entities for user ${userId}...`);

  try {
    // Ensure tenant exists for this user
    await ensureTenant(collectionName, userId);

    const collection = client.collections.get(collectionName);
    // Get tenant-specific collection handle
    const tenantCollection = collection.withTenant(userId);

    // Base properties for all collections
    const baseProperties = [
      'value',
      'normalized',
      'confidence',
      'source',
      'sourceId',
      'userId',
      'extractedAt',
      'context',
    ];

    // Add action_item specific properties only for ActionItem collection
    const returnProperties =
      entityType === 'action_item'
        ? [...baseProperties, 'assignee', 'deadline', 'priority']
        : baseProperties;

    const result = await tenantCollection.query.fetchObjects({
      limit,
      returnProperties,
    });

    console.log(`${LOG_PREFIX} Raw fetch returned ${result.objects.length} objects`);

    // No need to filter by userId - tenant isolation handles it
    const entities = result.objects
      .map((obj: any) => ({
        type: entityType,
        value: obj.properties.value,
        normalized: obj.properties.normalized,
        confidence: obj.properties.confidence,
        source: obj.properties.source as 'metadata' | 'body' | 'subject',
        context: obj.properties.context,
        sourceId: obj.properties.sourceId,
        extractedAt: obj.properties.extractedAt,
        // Action item specific fields
        ...(entityType === 'action_item' && {
          assignee: obj.properties.assignee,
          deadline: obj.properties.deadline,
          priority: obj.properties.priority as 'low' | 'medium' | 'high',
        }),
      }));

    console.log(`${LOG_PREFIX} Found ${entities.length} ${entityType} entities`);
    return entities;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to list ${entityType} entities:`, error);
    return [];
  }
}
