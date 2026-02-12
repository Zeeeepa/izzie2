/**
 * Entity Relationships Tool
 * Get all relationships for a specific entity
 */

import { z } from 'zod';
import { getEntityRelationships } from '@/lib/weaviate/relationships';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Entity Relationships Tool]';

/**
 * Get Entity Relationships Tool Schema
 */
export const getEntityRelationshipsToolSchema = z.object({
  entityType: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of the entity'),
  entityValue: z
    .string()
    .min(1)
    .describe('Value of the entity (name, email, etc.)'),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5)
    .describe('Minimum confidence score for relationships (0-1)'),
});

export type GetEntityRelationshipsParams = z.infer<typeof getEntityRelationshipsToolSchema>;

/**
 * Format relationship for display
 */
function formatRelationship(rel: any, centerEntity: string): string {
  const isFrom = rel.fromEntityValue.toLowerCase() === centerEntity.toLowerCase();

  let result = '';

  if (isFrom) {
    // This entity -> other entity
    result += `  • **${rel.relationshipType}** → ${rel.toEntityValue} (${rel.toEntityType})`;
  } else {
    // Other entity -> this entity
    result += `  • ${rel.fromEntityValue} (${rel.fromEntityType}) **${rel.relationshipType}** →`;
  }

  result += `\n    Confidence: ${Math.round(rel.confidence * 100)}%`;

  // Show status and temporal info if available
  if (rel.status && rel.status !== 'active') {
    result += ` | Status: ${rel.status}`;
  }
  if (rel.roleTitle) {
    result += ` | Role: ${rel.roleTitle}`;
  }
  if (rel.startDate || rel.endDate) {
    const period = [rel.startDate, rel.endDate].filter(Boolean).join(' to ');
    result += ` | Period: ${period}`;
  }

  if (rel.evidence) {
    const evidence = rel.evidence.length > 80
      ? rel.evidence.substring(0, 80) + '...'
      : rel.evidence;
    result += `\n    Evidence: "${evidence}"`;
  }

  return result;
}

/**
 * Get Entity Relationships Tool
 * Fetch all relationships for a specific entity
 */
export const getEntityRelationshipsTool = {
  name: 'get_entity_relationships',
  description:
    'Get all relationships for a specific entity. Returns relationships with type, confidence, evidence, and temporal information (status, dates, role titles).',
  parameters: getEntityRelationshipsToolSchema,

  async execute(
    params: GetEntityRelationshipsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = getEntityRelationshipsToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Fetching relationships: entity="${validated.entityValue}" (${validated.entityType}), user=${userId}`
      );

      const relationships = await getEntityRelationships(
        validated.entityType as EntityType,
        validated.entityValue,
        userId
      );

      // Filter by confidence
      const filtered = relationships.filter(
        (r) => r.confidence >= validated.minConfidence
      );

      if (filtered.length === 0) {
        return {
          message: `No relationships found for ${validated.entityType} "${validated.entityValue}" with confidence >= ${Math.round(validated.minConfidence * 100)}%.`,
        };
      }

      // Group by relationship type
      const byType = filtered.reduce((acc, rel) => {
        if (!acc[rel.relationshipType]) {
          acc[rel.relationshipType] = [];
        }
        acc[rel.relationshipType].push(rel);
        return acc;
      }, {} as Record<string, typeof relationships>);

      // Sort by confidence within each type
      for (const type in byType) {
        byType[type].sort((a, b) => b.confidence - a.confidence);
      }

      let message = `**Relationships for ${validated.entityType} "${validated.entityValue}"** (${filtered.length} total):\n\n`;

      for (const [type, rels] of Object.entries(byType)) {
        message += `**${type}** (${rels.length}):\n`;
        message += rels.map((r) => formatRelationship(r, validated.entityValue)).join('\n\n');
        message += '\n\n';
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to fetch relationships:`, error);
      throw new Error(
        `Failed to fetch entity relationships: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
