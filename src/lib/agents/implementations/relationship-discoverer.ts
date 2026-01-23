/**
 * Relationship Discoverer Agent
 * Analyzes entity co-occurrences and infers relationships
 *
 * Part of the 5 Proactive Long-Running Background Agents (#89)
 */

import { BaseAgent, createAgentFunction } from '../framework';
import { registerAgent } from '../registry';
import type { AgentConfig, AgentContext, AgentSource } from '../types';
import { listEntitiesByType } from '@/lib/weaviate/entities';
import { inferRelationships } from '@/lib/relationships/inference';
import { saveRelationships } from '@/lib/weaviate/relationships';
import type { EntityType, Entity } from '@/lib/extraction/types';

interface RelationshipDiscovererInput {
  userId: string;
  batchSize?: number;
  minConfidence?: number;
}

interface RelationshipDiscovererOutput {
  relationshipsInferred: number;
  entitiesAnalyzed: number;
  relationshipBreakdown: Record<string, number>;
  processingTime: number;
}

/**
 * Relationship Discoverer Agent
 *
 * This agent analyzes co-occurring entities across emails and calendar
 * events to infer meaningful relationships (e.g., "John works with Sarah",
 * "Alice works for Acme Corp").
 *
 * Uses the existing relationship inference module that leverages LLM
 * to analyze entity pairs and their surrounding context.
 */
class RelationshipDiscovererAgent extends BaseAgent<
  RelationshipDiscovererInput,
  RelationshipDiscovererOutput
> {
  name = 'relationship-discoverer';
  version = '1.0.0';
  description = 'Analyzes entity co-occurrences and infers relationships';

  config: AgentConfig = {
    trigger: 'izzie/agent.relationship-discoverer',
    maxConcurrency: 1,
    retries: 3,
    timeout: 600000, // 10 minutes
  };

  sources: AgentSource[] = ['entities'];

  async execute(
    input: RelationshipDiscovererInput,
    context: AgentContext
  ): Promise<RelationshipDiscovererOutput> {
    const { userId, batchSize = 50, minConfidence = 0.6 } = input;
    const startTime = Date.now();
    let relationshipsInferred = 0;
    let entitiesAnalyzed = 0;
    const relationshipBreakdown: Record<string, number> = {};

    context.log('Starting relationship discovery', { batchSize, minConfidence });

    // Get cursor to track progress
    const cursor = await this.getCursor(userId, 'entities');
    const lastProcessedDate = cursor?.lastProcessedDate || new Date(0);

    context.log('Retrieved cursor', {
      lastProcessedDate: lastProcessedDate.toISOString(),
    });

    try {
      // Entity types that participate in relationships
      const relationshipEntityTypes: EntityType[] = [
        'person',
        'company',
        'project',
        'topic',
        'location',
      ];

      // Collect all entities for relationship analysis
      // Using a simplified type that includes sourceId for grouping
      interface EntityWithSource {
        type: EntityType;
        value: string;
        normalized: string;
        sourceId?: string;
        context?: string;
        confidence: number;
        source: 'metadata' | 'body' | 'subject';
      }

      const allEntities: EntityWithSource[] = [];

      // Fetch entities of each type
      for (const entityType of relationshipEntityTypes) {
        const entities = await listEntitiesByType(userId, entityType, batchSize);

        for (const entity of entities) {
          allEntities.push({
            type: entityType,
            value: entity.value,
            normalized: entity.normalized || entity.value, // Ensure normalized is always set
            sourceId: entity.sourceId,
            context: entity.context,
            confidence: entity.confidence,
            source: entity.source,
          });
        }
      }

      entitiesAnalyzed = allEntities.length;
      context.log(`Found ${entitiesAnalyzed} entities to analyze`);

      if (allEntities.length < 2) {
        context.log('Not enough entities for relationship inference');
        return {
          relationshipsInferred: 0,
          entitiesAnalyzed,
          relationshipBreakdown,
          processingTime: Date.now() - startTime,
        };
      }

      // Group entities by sourceId for co-occurrence analysis
      const entitiesBySource = new Map<string, EntityWithSource[]>();

      for (const entity of allEntities) {
        if (entity.sourceId) {
          const existing = entitiesBySource.get(entity.sourceId) || [];
          existing.push(entity);
          entitiesBySource.set(entity.sourceId, existing);
        }
      }

      // Process each source that has multiple entities
      const sourcesToProcess = Array.from(entitiesBySource.entries()).filter(
        ([_, entities]) => entities.length >= 2
      );

      context.log(`Found ${sourcesToProcess.length} sources with co-occurring entities`);

      let sourcesProcessed = 0;
      for (const [sourceId, sourceEntities] of sourcesToProcess) {
        try {
          // Build content context from entity contexts
          const contentParts = sourceEntities
            .filter((e) => e.context)
            .map((e) => e.context)
            .filter(Boolean);

          const sourceContent = contentParts.join('\n\n').substring(0, 3000);

          // Convert to Entity[] for inferRelationships
          const entitiesForInference: Entity[] = sourceEntities.map((e) => ({
            type: e.type,
            value: e.value,
            normalized: e.normalized,
            confidence: e.confidence,
            source: e.source,
            context: e.context,
          }));

          // Use the relationship inference module
          const result = await inferRelationships(
            entitiesForInference,
            sourceContent,
            sourceId,
            userId
          );

          // Filter by confidence threshold
          const validRelationships = result.relationships.filter(
            (r) => r.confidence >= minConfidence
          );

          if (validRelationships.length > 0) {
            // Save relationships to Weaviate
            await saveRelationships(validRelationships, userId);

            relationshipsInferred += validRelationships.length;

            // Track breakdown by type
            for (const rel of validRelationships) {
              const relType = rel.relationshipType;
              relationshipBreakdown[relType] = (relationshipBreakdown[relType] || 0) + 1;
            }

            context.log(`Inferred ${validRelationships.length} relationships from source`, {
              sourceId,
              types: validRelationships.map((r) => r.relationshipType),
            });
          }
        } catch (error) {
          context.log('Error inferring relationships for source', {
            sourceId,
            error: String(error),
          });
        }

        sourcesProcessed++;
        const progress = Math.floor((sourcesProcessed / sourcesToProcess.length) * 100);
        await context.trackProgress(progress, sourcesProcessed);
      }

      // Update cursor
      await this.saveCursor(userId, 'entities', {
        lastProcessedDate: new Date(),
        checkpoint: { entitiesAnalyzed, relationshipsInferred },
      });
    } catch (error) {
      context.log('Error in relationship discovery', { error: String(error) });
    }

    const processingTime = Date.now() - startTime;

    return {
      relationshipsInferred,
      entitiesAnalyzed,
      relationshipBreakdown,
      processingTime,
    };
  }

  async onComplete(output: RelationshipDiscovererOutput, context: AgentContext): Promise<void> {
    context.log('Relationship discovery completed', {
      relationshipsInferred: output.relationshipsInferred,
      entitiesAnalyzed: output.entitiesAnalyzed,
      processingTimeMs: output.processingTime,
    });

    // Emit event for downstream processing (e.g., graph updates)
    if (output.relationshipsInferred > 0) {
      await context.emit('izzie/relationships.discovered', {
        userId: context.userId,
        count: output.relationshipsInferred,
        breakdown: output.relationshipBreakdown,
      });
    }
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    context.log('Relationship discovery failed', { error: error.message });
  }
}

export const relationshipDiscovererAgent = new RelationshipDiscovererAgent();
registerAgent(relationshipDiscovererAgent);
export const relationshipDiscovererFunction = createAgentFunction(relationshipDiscovererAgent);
