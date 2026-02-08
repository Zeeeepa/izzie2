/**
 * Weaviate Relationship Storage
 *
 * Save, query, and visualize inferred relationships between entities.
 */

import { Filters } from 'weaviate-client';
import { getWeaviateClient, ensureTenant } from './client';
import { RELATIONSHIP_COLLECTION } from './schema';
import type {
  InferredRelationship,
  RelationshipGraph,
  GraphNode,
  GraphEdge,
  RelationshipType,
  RelationshipStatus,
} from '../relationships/types';
import type { EntityType } from '../extraction/types';

const LOG_PREFIX = '[Weaviate Relationships]';

// Color scheme for entity types in graph visualization
const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6', // blue
  company: '#22c55e', // green
  project: '#fbbf24', // yellow
  topic: '#a855f7', // purple
  location: '#ec4899', // pink
  action_item: '#ef4444', // red
  date: '#64748b', // gray
};

/**
 * Generate a unique key for a relationship to detect duplicates
 */
function getRelationshipKey(
  userId: string,
  fromEntityType: string,
  fromEntityValue: string,
  toEntityType: string,
  toEntityValue: string,
  relationshipType: string
): string {
  return `${userId}|${fromEntityType}|${fromEntityValue.toLowerCase()}|${toEntityType}|${toEntityValue.toLowerCase()}|${relationshipType}`;
}

/**
 * Check for existing relationships to prevent duplicates
 * Uses tenant-aware collection access for data isolation.
 */
async function findExistingRelationshipKeys(
  tenantCollection: any,
  userId: string
): Promise<Set<string>> {
  const existingKeys = new Set<string>();

  try {
    // With multi-tenancy, we query the tenant-specific collection directly
    // No need for userId filter - tenant isolation handles it
    const result = await tenantCollection.query.fetchObjects({
      limit: 10000,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'userId',
      ],
    });

    for (const obj of result.objects) {
      const key = getRelationshipKey(
        obj.properties.userId,
        obj.properties.fromEntityType,
        obj.properties.fromEntityValue,
        obj.properties.toEntityType,
        obj.properties.toEntityValue,
        obj.properties.relationshipType
      );
      existingKeys.add(key);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch existing relationships for deduplication:`, error);
  }

  return existingKeys;
}

/**
 * Save inferred relationships to Weaviate
 * Checks for existing relationships before inserting to prevent duplicates.
 * A relationship is considered duplicate if it has the same:
 * userId + fromEntityType + fromEntityValue + toEntityType + toEntityValue + relationshipType
 */
export async function saveRelationships(
  relationships: InferredRelationship[],
  userId: string
): Promise<number> {
  if (relationships.length === 0) {
    console.log(`${LOG_PREFIX} No relationships to save`);
    return 0;
  }

  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  console.log(`${LOG_PREFIX} Checking for duplicates among ${relationships.length} relationships...`);

  // Fetch existing relationship keys for this user's tenant
  const existingKeys = await findExistingRelationshipKeys(tenantCollection, userId);
  console.log(`${LOG_PREFIX} Found ${existingKeys.size} existing relationships for user`);

  // Filter out duplicates
  const uniqueRelationships = relationships.filter((rel) => {
    const key = getRelationshipKey(
      userId,
      rel.fromEntityType,
      rel.fromEntityValue,
      rel.toEntityType,
      rel.toEntityValue,
      rel.relationshipType
    );
    return !existingKeys.has(key);
  });

  const duplicateCount = relationships.length - uniqueRelationships.length;
  if (duplicateCount > 0) {
    console.log(`${LOG_PREFIX} Skipping ${duplicateCount} duplicate relationships`);
  }

  if (uniqueRelationships.length === 0) {
    console.log(`${LOG_PREFIX} No new relationships to save (all duplicates)`);
    return 0;
  }

  console.log(`${LOG_PREFIX} Saving ${uniqueRelationships.length} unique relationships...`);

  const objects = uniqueRelationships.map((rel) => ({
    fromEntityType: rel.fromEntityType,
    fromEntityValue: rel.fromEntityValue.toLowerCase(),
    toEntityType: rel.toEntityType,
    toEntityValue: rel.toEntityValue.toLowerCase(),
    relationshipType: rel.relationshipType,
    confidence: rel.confidence,
    evidence: rel.evidence,
    sourceId: rel.sourceId,
    userId,
    inferredAt: rel.inferredAt || new Date().toISOString(),
    // Temporal qualifier fields - default to 'active' for new relationships
    startDate: rel.startDate || null,
    endDate: rel.endDate || null,
    status: rel.status || 'active',
    roleTitle: rel.roleTitle || null,
    lastVerified: rel.lastVerified || null,
  }));

  try {
    // Insert to tenant-specific collection
    const result = await tenantCollection.data.insertMany(objects);
    const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;
    console.log(`${LOG_PREFIX} Saved ${insertedCount} relationships (tenant: ${userId})`);
    return insertedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save relationships:`, error);
    throw error;
  }
}

/**
 * Get relationships for a specific entity
 */
export async function getEntityRelationships(
  entityType: EntityType,
  entityValue: string,
  userId: string
): Promise<InferredRelationship[]> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);
  const normalizedValue = entityValue.toLowerCase();

  console.log(`${LOG_PREFIX} Fetching relationships for ${entityType}: ${entityValue}`);

  try {
    // Build filter for entity match (from OR to) using Weaviate Filters API
    // No need for userId filter - tenant isolation handles it
    const fromFilter = Filters.and(
      tenantCollection.filter.byProperty('fromEntityType').equal(entityType),
      tenantCollection.filter.byProperty('fromEntityValue').equal(normalizedValue)
    );
    const toFilter = Filters.and(
      tenantCollection.filter.byProperty('toEntityType').equal(entityType),
      tenantCollection.filter.byProperty('toEntityValue').equal(normalizedValue)
    );
    const entityFilter = Filters.or(fromFilter, toFilter);

    const result = await tenantCollection.query.fetchObjects({
      filters: entityFilter,
      limit: 500,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
        // Temporal qualifier fields
        'startDate',
        'endDate',
        'status',
        'roleTitle',
        'lastVerified',
      ],
    });

    const relationships = result.objects.map((obj: any) => ({
      id: obj.uuid,
      fromEntityType: obj.properties.fromEntityType as EntityType,
      fromEntityValue: obj.properties.fromEntityValue,
      toEntityType: obj.properties.toEntityType as EntityType,
      toEntityValue: obj.properties.toEntityValue,
      relationshipType: obj.properties.relationshipType as RelationshipType,
      confidence: obj.properties.confidence,
      evidence: obj.properties.evidence,
      sourceId: obj.properties.sourceId,
      userId: obj.properties.userId,
      inferredAt: obj.properties.inferredAt,
      // Temporal qualifier fields
      startDate: obj.properties.startDate || undefined,
      endDate: obj.properties.endDate || undefined,
      status: obj.properties.status || 'unknown',
      roleTitle: obj.properties.roleTitle || undefined,
      lastVerified: obj.properties.lastVerified || undefined,
    }));

    console.log(`${LOG_PREFIX} Found ${relationships.length} relationships`);
    return relationships;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch relationships:`, error);
    return [];
  }
}

/**
 * Get all relationships for a user
 */
export async function getAllRelationships(
  userId: string,
  limit: number = 1000
): Promise<InferredRelationship[]> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  console.log(`${LOG_PREFIX} Fetching all relationships for user ${userId}...`);

  try {
    // No need for userId filter - tenant isolation handles it
    const result = await tenantCollection.query.fetchObjects({
      limit,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
        // Temporal qualifier fields
        'startDate',
        'endDate',
        'status',
        'roleTitle',
        'lastVerified',
      ],
    });

    const relationships = result.objects.map((obj: any) => ({
      id: obj.uuid,
      fromEntityType: obj.properties.fromEntityType as EntityType,
      fromEntityValue: obj.properties.fromEntityValue,
      toEntityType: obj.properties.toEntityType as EntityType,
      toEntityValue: obj.properties.toEntityValue,
      relationshipType: obj.properties.relationshipType as RelationshipType,
      confidence: obj.properties.confidence,
      evidence: obj.properties.evidence,
      sourceId: obj.properties.sourceId,
      userId: obj.properties.userId,
      inferredAt: obj.properties.inferredAt,
      // Temporal qualifier fields
      startDate: obj.properties.startDate || undefined,
      endDate: obj.properties.endDate || undefined,
      status: obj.properties.status || 'unknown',
      roleTitle: obj.properties.roleTitle || undefined,
      lastVerified: obj.properties.lastVerified || undefined,
    }));

    console.log(`${LOG_PREFIX} Found ${relationships.length} total relationships`);
    return relationships;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch relationships:`, error);
    return [];
  }
}

// Extended node type for frontend visualization (includes value/normalized for display)
interface FrontendGraphNode {
  id: string;
  type: EntityType;
  value: string;
  normalized: string;
  connectionCount: number;
}

// Extended edge type for frontend visualization (includes confidence/evidence)
interface FrontendGraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  confidence: number;
  evidence?: string;
}

// Extended graph type for frontend
interface FrontendRelationshipGraph {
  nodes: FrontendGraphNode[];
  edges: FrontendGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
  };
}

/**
 * Build a graph representation for visualization
 * Returns data formatted for the frontend dashboard
 */
export async function buildRelationshipGraph(
  userId: string,
  options?: {
    centerEntity?: { type: EntityType; value: string };
    maxDepth?: number;
    minConfidence?: number;
  }
): Promise<FrontendRelationshipGraph> {
  const relationships = await getAllRelationships(userId);
  const minConfidence = options?.minConfidence || 0.5;

  // Filter by confidence
  const filteredRels = relationships.filter((r) => r.confidence >= minConfidence);

  // Build nodes map with connection counts
  const nodesMap = new Map<string, FrontendGraphNode>();
  const edgeCounts = new Map<string, number>();

  for (const rel of filteredRels) {
    // From node
    const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
    if (!nodesMap.has(fromId)) {
      nodesMap.set(fromId, {
        id: fromId,
        type: rel.fromEntityType,
        value: rel.fromEntityValue,
        normalized: rel.fromEntityValue.toLowerCase(),
        connectionCount: 0,
      });
    }
    edgeCounts.set(fromId, (edgeCounts.get(fromId) || 0) + 1);

    // To node
    const toId = `${rel.toEntityType}:${rel.toEntityValue}`;
    if (!nodesMap.has(toId)) {
      nodesMap.set(toId, {
        id: toId,
        type: rel.toEntityType,
        value: rel.toEntityValue,
        normalized: rel.toEntityValue.toLowerCase(),
        connectionCount: 0,
      });
    }
    edgeCounts.set(toId, (edgeCounts.get(toId) || 0) + 1);
  }

  // Update node connection counts
  for (const [id, count] of Array.from(edgeCounts.entries())) {
    const node = nodesMap.get(id);
    if (node) {
      node.connectionCount = count;
    }
  }

  // Build edges (keep best confidence for duplicates, store evidence)
  const edgesMap = new Map<string, FrontendGraphEdge>();

  for (const rel of filteredRels) {
    const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
    const toId = `${rel.toEntityType}:${rel.toEntityValue}`;
    const edgeKey = `${fromId}:${rel.relationshipType}:${toId}`;

    const existing = edgesMap.get(edgeKey);
    if (existing) {
      // Keep the higher confidence version
      if (rel.confidence > existing.confidence) {
        existing.confidence = rel.confidence;
        existing.evidence = rel.evidence;
      }
    } else {
      edgesMap.set(edgeKey, {
        id: edgeKey,
        source: fromId,
        target: toId,
        type: rel.relationshipType,
        confidence: rel.confidence,
        evidence: rel.evidence,
      });
    }
  }

  const nodes = Array.from(nodesMap.values());
  const edges = Array.from(edgesMap.values());

  return {
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

/**
 * Get relationship statistics
 */
export async function getRelationshipStats(userId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
}> {
  const relationships = await getAllRelationships(userId);

  const byType: Record<string, number> = {};
  let totalConfidence = 0;

  for (const rel of relationships) {
    byType[rel.relationshipType] = (byType[rel.relationshipType] || 0) + 1;
    totalConfidence += rel.confidence;
  }

  return {
    total: relationships.length,
    byType,
    avgConfidence:
      relationships.length > 0
        ? Math.round((totalConfidence / relationships.length) * 100) / 100
        : 0,
  };
}

/**
 * Delete a single relationship by ID
 * Uses tenant isolation for data security.
 */
export async function deleteRelationshipById(
  id: string,
  userId: string
): Promise<boolean> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    // Fetch the relationship from tenant (tenant isolation ensures ownership)
    const result = await tenantCollection.query.fetchObjectById(id, {
      returnProperties: ['userId'],
    });

    if (!result) {
      console.log(`${LOG_PREFIX} Relationship ${id} not found in tenant ${userId}`);
      return false;
    }

    // Delete the relationship from tenant
    await tenantCollection.data.deleteById(id);
    console.log(`${LOG_PREFIX} Deleted relationship ${id} (tenant: ${userId})`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete relationship ${id}:`, error);
    return false;
  }
}

/**
 * Delete all relationships for a user
 */
export async function deleteAllRelationships(userId: string): Promise<number> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    // No need for userId filter - tenant isolation handles it
    const result = await tenantCollection.query.fetchObjects({
      limit: 10000,
      returnProperties: ['userId'],
    });

    let deletedCount = 0;
    for (const obj of result.objects) {
      await tenantCollection.data.deleteById(obj.uuid);
      deletedCount++;
    }

    console.log(`${LOG_PREFIX} Deleted ${deletedCount} relationships for user ${userId} (tenant)`);
    return deletedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete all relationships:`, error);
    return 0;
  }
}

/**
 * Update a relationship's temporal fields
 * Used for status transitions (e.g., active -> former) and metadata updates
 */
export async function updateRelationship(
  id: string,
  userId: string,
  updates: {
    status?: RelationshipStatus;
    endDate?: string;
    startDate?: string;
    roleTitle?: string;
    lastVerified?: string;
  }
): Promise<InferredRelationship | null> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    // First fetch the existing relationship to verify it exists
    const existing = await tenantCollection.query.fetchObjectById(id, {
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
        'startDate',
        'endDate',
        'status',
        'roleTitle',
        'lastVerified',
      ],
    });

    if (!existing) {
      console.log(`${LOG_PREFIX} Relationship ${id} not found in tenant ${userId}`);
      return null;
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.endDate !== undefined) updateData.endDate = updates.endDate;
    if (updates.startDate !== undefined) updateData.startDate = updates.startDate;
    if (updates.roleTitle !== undefined) updateData.roleTitle = updates.roleTitle;
    if (updates.lastVerified !== undefined) updateData.lastVerified = updates.lastVerified;

    // Update the relationship
    await tenantCollection.data.update({
      id,
      properties: updateData,
    });

    console.log(`${LOG_PREFIX} Updated relationship ${id} (tenant: ${userId}):`, Object.keys(updateData));

    // Return the updated relationship
    const updated = await tenantCollection.query.fetchObjectById(id, {
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
        'startDate',
        'endDate',
        'status',
        'roleTitle',
        'lastVerified',
      ],
    });

    if (!updated) return null;

    // Cast to any to avoid Weaviate type inference issues
    const obj: any = updated;
    return {
      id: obj.uuid,
      fromEntityType: obj.properties.fromEntityType as EntityType,
      fromEntityValue: obj.properties.fromEntityValue,
      toEntityType: obj.properties.toEntityType as EntityType,
      toEntityValue: obj.properties.toEntityValue,
      relationshipType: obj.properties.relationshipType as RelationshipType,
      confidence: obj.properties.confidence,
      evidence: obj.properties.evidence,
      sourceId: obj.properties.sourceId,
      userId: obj.properties.userId,
      inferredAt: obj.properties.inferredAt,
      startDate: obj.properties.startDate || undefined,
      endDate: obj.properties.endDate || undefined,
      status: obj.properties.status || 'unknown',
      roleTitle: obj.properties.roleTitle || undefined,
      lastVerified: obj.properties.lastVerified || undefined,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to update relationship ${id}:`, error);
    return null;
  }
}

/**
 * Delete relationships for a source
 */
export async function deleteRelationshipsBySource(
  sourceId: string,
  userId: string
): Promise<number> {
  const client = await getWeaviateClient();

  // Ensure tenant exists for this user
  await ensureTenant(RELATIONSHIP_COLLECTION, userId);

  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  // Get tenant-specific collection handle
  const tenantCollection = collection.withTenant(userId);

  try {
    // Filter by sourceId only - tenant isolation handles userId
    const filters = tenantCollection.filter.byProperty('sourceId').equal(sourceId);

    const result = await tenantCollection.query.fetchObjects({
      filters,
      limit: 1000,
      returnProperties: ['sourceId'],
    });

    for (const obj of result.objects) {
      await tenantCollection.data.deleteById(obj.uuid);
    }

    console.log(`${LOG_PREFIX} Deleted ${result.objects.length} relationships for source ${sourceId} (tenant: ${userId})`);
    return result.objects.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete relationships:`, error);
    return 0;
  }
}
