/**
 * Bulk Relationship Inference API Route
 * POST /api/relationships/bulk-infer - Infer relationships from all entities
 *
 * Groups entities by sourceId and runs inference on each group
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { inferRelationships } from '@/lib/relationships/inference';
import { saveRelationships } from '@/lib/weaviate/relationships';
import { listEntitiesByType } from '@/lib/weaviate/entities';
import type { Entity, EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Relationships Bulk Infer API]';

// Types for entity data from Weaviate
interface WeaviateEntity {
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  sourceId: string;
  context?: string;
}

interface FetchResult {
  entities: WeaviateEntity[];
  entitiesPerType: Record<string, number>;
  errors: string[];
}

interface GroupMetrics {
  groupSizes: Record<string, number>;
  eligibleGroups: number;
  skippedSingleEntity: number;
}

interface ProcessResult {
  relationshipsFound: number;
  tokenCost: number;
}

/**
 * Fetch entities of specified types from Weaviate
 */
async function fetchEntitiesByTypes(
  userId: string,
  entityTypes: EntityType[],
  limit: number
): Promise<FetchResult> {
  const entities: WeaviateEntity[] = [];
  const entitiesPerType: Record<string, number> = {};
  const errors: string[] = [];

  for (const type of entityTypes) {
    try {
      const fetched = await listEntitiesByType(userId, type, limit);
      entitiesPerType[type] = fetched.length;
      console.log(`${LOG_PREFIX} [DIAG] Fetched ${fetched.length} ${type} entities`);

      if (fetched.length > 0) {
        const sample = fetched[0];
        console.log(`${LOG_PREFIX} [DIAG] Sample ${type} entity:`, {
          value: sample.value,
          sourceId: sample.sourceId,
          hasContext: !!sample.context,
        });
      }

      entities.push(
        ...fetched.map((e: any) => ({
          type: e.type || type,
          value: e.value,
          normalized: e.normalized,
          confidence: e.confidence,
          source: e.source,
          sourceId: e.sourceId,
          context: e.context,
        }))
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} Error fetching ${type} entities:`, err);
      errors.push(`Failed to fetch ${type} entities`);
    }
  }

  return { entities, entitiesPerType, errors };
}

/**
 * Group entities by sourceId and compute diagnostic metrics
 */
function groupEntitiesBySource(entities: WeaviateEntity[]): {
  groups: Map<string, WeaviateEntity[]>;
  metrics: GroupMetrics;
} {
  const groups = new Map<string, WeaviateEntity[]>();

  for (const entity of entities) {
    const sourceId = entity.sourceId || 'unknown';
    if (!groups.has(sourceId)) {
      groups.set(sourceId, []);
    }
    groups.get(sourceId)!.push(entity);
  }

  const groupSizes: Record<string, number> = {};
  let eligibleGroups = 0;
  let skippedSingleEntity = 0;

  for (const [, groupEntities] of groups) {
    const size = groupEntities.length;
    const sizeKey = size >= 5 ? '5+' : String(size);
    groupSizes[sizeKey] = (groupSizes[sizeKey] || 0) + 1;

    if (size >= 2) {
      eligibleGroups++;
    } else {
      skippedSingleEntity++;
    }
  }

  return { groups, metrics: { groupSizes, eligibleGroups, skippedSingleEntity } };
}

/**
 * Build context string from entity contexts or fallback to entity list
 */
function buildGroupContext(entities: WeaviateEntity[], sourceId: string): string {
  const contextParts = entities
    .filter((e) => e.context)
    .map((e) => e.context)
    .slice(0, 5);

  if (contextParts.length > 0) {
    return contextParts.join('\n\n');
  }

  return `Entities from source ${sourceId}: ${entities.map((e) => `${e.type}: ${e.value}`).join(', ')}`;
}

/**
 * Convert WeaviateEntity to Entity type for inference
 */
function toInferenceEntities(entities: WeaviateEntity[]): Entity[] {
  return entities.map((e) => ({
    type: e.type as Entity['type'],
    value: e.value,
    normalized: e.normalized,
    confidence: e.confidence,
    source: e.source as Entity['source'],
  }));
}

/**
 * Process a single entity group - run inference and save relationships
 */
async function processEntityGroup(
  sourceId: string,
  entities: WeaviateEntity[],
  userId: string
): Promise<ProcessResult> {
  const content = buildGroupContext(entities, sourceId);
  const inferenceEntities = toInferenceEntities(entities);

  console.log(
    `${LOG_PREFIX} [DIAG] Processing group ${sourceId}: ${entities.length} entities, content length: ${content.length}`
  );

  const result = await inferRelationships(inferenceEntities, content, sourceId, userId);

  console.log(
    `${LOG_PREFIX} [DIAG] Inference result for ${sourceId}: ${result.relationships.length} relationships found`
  );

  if (result.relationships.length > 0) {
    await saveRelationships(result.relationships, userId);
  }

  return { relationshipsFound: result.relationships.length, tokenCost: result.tokenCost };
}

/**
 * Log diagnostic summary
 */
function logDiagnosticSummary(
  totalEntities: number,
  totalSources: number,
  eligibleGroups: number,
  processedSources: number,
  skippedGroups: number,
  totalRelationships: number
): void {
  console.log(`${LOG_PREFIX} [DIAG] === SUMMARY ===`);
  console.log(`${LOG_PREFIX} [DIAG] Total entities fetched: ${totalEntities}`);
  console.log(`${LOG_PREFIX} [DIAG] Unique sources: ${totalSources}`);
  console.log(`${LOG_PREFIX} [DIAG] Eligible groups (>=2 entities): ${eligibleGroups}`);
  console.log(`${LOG_PREFIX} [DIAG] Groups processed: ${processedSources}`);
  console.log(`${LOG_PREFIX} [DIAG] Groups skipped (single entity): ${skippedGroups}`);
  console.log(`${LOG_PREFIX} [DIAG] Relationships found: ${totalRelationships}`);
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit || 100, 500);
    const defaultTypes: EntityType[] = ['person', 'company', 'project'];
    const entityTypes: EntityType[] = body.entityTypes || defaultTypes;

    console.log(`${LOG_PREFIX} Starting bulk inference for user ${userId}`);
    console.log(`${LOG_PREFIX} Entity types: ${entityTypes.join(', ')}, limit: ${limit}`);

    const startTime = Date.now();

    // Fetch entities
    const { entities: allEntities, entitiesPerType, errors } = await fetchEntitiesByTypes(
      userId,
      entityTypes,
      limit
    );

    console.log(`${LOG_PREFIX} Fetched ${allEntities.length} entities total`);
    console.log(`${LOG_PREFIX} [DIAG] Entities per type:`, entitiesPerType);

    if (allEntities.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entities found to process',
        totalRelationships: 0,
        totalCost: 0,
        processingTime: Date.now() - startTime,
      });
    }

    // Group entities by sourceId
    const { groups: entityGroups, metrics } = groupEntitiesBySource(allEntities);

    console.log(`${LOG_PREFIX} [DIAG] Unique sourceIds: ${entityGroups.size}`);
    console.log(`${LOG_PREFIX} Grouped into ${entityGroups.size} sources`);
    console.log(`${LOG_PREFIX} [DIAG] Group size distribution:`, metrics.groupSizes);
    console.log(
      `${LOG_PREFIX} [DIAG] Eligible groups (>=2 entities): ${metrics.eligibleGroups}, Skipped (<2 entities): ${metrics.skippedSingleEntity}`
    );
    console.log(`${LOG_PREFIX} [DIAG] Sample sourceIds:`, Array.from(entityGroups.keys()).slice(0, 5));

    // Process groups
    const maxSources = Math.min(entityGroups.size, 20);
    let processedSources = 0;
    let skippedGroups = 0;
    let totalRelationships = 0;
    let totalCost = 0;

    for (const [sourceId, entities] of entityGroups) {
      if (processedSources >= maxSources) break;

      if (entities.length < 2) {
        skippedGroups++;
        continue;
      }

      try {
        const result = await processEntityGroup(sourceId, entities, userId);
        totalRelationships += result.relationshipsFound;
        totalCost += result.tokenCost;
        processedSources++;
      } catch (err) {
        console.error(`${LOG_PREFIX} Error processing source ${sourceId}:`, err);
        errors.push(`Failed to process source: ${sourceId}`);
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Completed: ${totalRelationships} relationships from ${processedSources} sources in ${processingTime}ms`
    );

    logDiagnosticSummary(
      allEntities.length,
      entityGroups.size,
      metrics.eligibleGroups,
      processedSources,
      skippedGroups,
      totalRelationships
    );

    return NextResponse.json({
      success: true,
      totalRelationships,
      totalCost: Math.round(totalCost * 10000) / 10000,
      sourcesProcessed: processedSources,
      totalSources: entityGroups.size,
      entitiesProcessed: allEntities.length,
      processingTime,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to run bulk inference',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
