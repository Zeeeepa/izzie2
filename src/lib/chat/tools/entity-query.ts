/**
 * Entity Query Tool
 * Search for entities by name, email, or description using Weaviate's BM25 keyword search
 */

import { z } from 'zod';
import { searchEntities } from '@/lib/weaviate/entities';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Entity Query Tool]';

/**
 * Query Entity Tool Schema
 */
export const queryEntityToolSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'Search query to find entities. Searches across names, emails, companies, projects, topics, locations, and action items.'
    ),
  entityType: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .optional()
    .describe('Optional: Filter results by specific entity type'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-50)'),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5)
    .describe('Minimum confidence score for results (0-1)'),
});

export type QueryEntityParams = z.infer<typeof queryEntityToolSchema>;

/**
 * Format entity for display in chat
 */
function formatEntity(entity: any, index: number): string {
  let result = `${index + 1}. **${entity.value}**`;

  if (entity.normalized && entity.normalized !== entity.value.toLowerCase()) {
    result += ` (${entity.normalized})`;
  }

  result += `\n   Type: ${entity.type}`;
  result += `\n   Confidence: ${Math.round(entity.confidence * 100)}%`;

  if (entity.context) {
    // Truncate long context
    const context = entity.context.length > 100
      ? entity.context.substring(0, 100) + '...'
      : entity.context;
    result += `\n   Context: "${context}"`;
  }

  // Action item specific fields
  if (entity.type === 'action_item') {
    if (entity.assignee) {
      result += `\n   Assignee: ${entity.assignee}`;
    }
    if (entity.deadline) {
      result += `\n   Deadline: ${entity.deadline}`;
    }
    if (entity.priority) {
      result += `\n   Priority: ${entity.priority}`;
    }
  }

  return result;
}

/**
 * Query Entity Tool
 * Search for entities using keyword search
 */
export const queryEntityTool = {
  name: 'query_entity',
  description:
    'Search for entities by name, email, company, project, topic, location, or action items. Returns matching entities with their type, confidence score, and context.',
  parameters: queryEntityToolSchema,

  async execute(
    params: QueryEntityParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = queryEntityToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Searching entities: query="${validated.query}", type=${validated.entityType || 'all'}, user=${userId}`
      );

      const entities = await searchEntities(validated.query, userId, {
        entityType: validated.entityType as EntityType | undefined,
        limit: validated.limit,
        minConfidence: validated.minConfidence,
      });

      if (entities.length === 0) {
        let message = `No entities found matching "${validated.query}"`;
        if (validated.entityType) {
          message += ` with type "${validated.entityType}"`;
        }
        message += `.`;
        return { message };
      }

      const entityList = entities
        .slice(0, validated.limit)
        .map((e, i) => formatEntity(e, i))
        .join('\n\n');

      let message = `**Found ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'} matching "${validated.query}"**`;
      if (validated.entityType) {
        message += ` (type: ${validated.entityType})`;
      }
      if (entities.length > validated.limit) {
        message += ` (showing first ${validated.limit})`;
      }
      message += `:\n\n${entityList}`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Query failed:`, error);
      throw new Error(
        `Failed to query entities: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
