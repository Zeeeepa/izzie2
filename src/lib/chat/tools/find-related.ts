/**
 * Find Related Entities Tool
 * Graph traversal to find entities connected to a starting entity
 */

import { z } from 'zod';
import { getEntityRelationships } from '@/lib/weaviate/relationships';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Find Related Tool]';

/**
 * Find Related Entities Tool Schema
 */
export const findRelatedEntitiesToolSchema = z.object({
  entityType: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of the starting entity'),
  entityValue: z
    .string()
    .min(1)
    .describe('Value of the starting entity (name, email, etc.)'),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .default(2)
    .describe('Maximum depth for graph traversal (1-3)'),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5)
    .describe('Minimum confidence score for relationships (0-1)'),
  relationshipTypes: z
    .array(
      z.enum([
        'WORKS_FOR',
        'WORKS_WITH',
        'REPORTS_TO',
        'MANAGES',
        'LOCATED_IN',
        'ASSIGNED_TO',
        'RELATED_TO',
        'PARTICIPATES_IN',
        'OWNS',
        'USES',
      ])
    )
    .optional()
    .describe('Optional: Filter by specific relationship types'),
});

export type FindRelatedEntitiesParams = z.infer<typeof findRelatedEntitiesToolSchema>;

/**
 * Entity node in the graph
 */
interface EntityNode {
  type: EntityType;
  value: string;
  depth: number;
  pathFrom: string[]; // Path of entity values from root
}

/**
 * BFS graph traversal to find related entities
 * Returns entities grouped by depth level
 */
async function traverseGraph(
  startType: EntityType,
  startValue: string,
  userId: string,
  maxDepth: number,
  minConfidence: number,
  relationshipTypes?: string[]
): Promise<Map<number, EntityNode[]>> {
  const visited = new Set<string>();
  const queue: EntityNode[] = [
    {
      type: startType,
      value: startValue,
      depth: 0,
      pathFrom: [],
    },
  ];

  const resultsByDepth = new Map<number, EntityNode[]>();
  const entityKey = (type: EntityType, value: string) => `${type}:${value.toLowerCase()}`;

  // Mark starting entity as visited
  visited.add(entityKey(startType, startValue));

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Skip if we've reached max depth
    if (current.depth >= maxDepth) {
      continue;
    }

    // Fetch relationships for current entity
    const relationships = await getEntityRelationships(
      current.type,
      current.value,
      userId
    );

    // Filter by confidence and relationship types
    const filtered = relationships.filter((r) => {
      if (r.confidence < minConfidence) return false;
      if (relationshipTypes && !relationshipTypes.includes(r.relationshipType)) return false;
      return true;
    });

    for (const rel of filtered) {
      // Determine the connected entity (not the current one)
      const isFrom = rel.fromEntityValue.toLowerCase() === current.value.toLowerCase();
      const connectedType = isFrom ? rel.toEntityType : rel.fromEntityType;
      const connectedValue = isFrom ? rel.toEntityValue : rel.fromEntityValue;

      const key = entityKey(connectedType, connectedValue);

      // Skip if already visited
      if (visited.has(key)) {
        continue;
      }

      visited.add(key);

      const nextDepth = current.depth + 1;
      const node: EntityNode = {
        type: connectedType,
        value: connectedValue,
        depth: nextDepth,
        pathFrom: [...current.pathFrom, current.value],
      };

      // Add to results by depth
      if (!resultsByDepth.has(nextDepth)) {
        resultsByDepth.set(nextDepth, []);
      }
      resultsByDepth.get(nextDepth)!.push(node);

      // Add to queue for further traversal
      queue.push(node);
    }
  }

  return resultsByDepth;
}

/**
 * Find Related Entities Tool
 * Use BFS graph traversal to find connected entities
 */
export const findRelatedEntitiesTool = {
  name: 'find_related_entities',
  description:
    'Find entities related to a starting entity using graph traversal. Discovers connections up to a specified depth, following relationships like WORKS_FOR, WORKS_WITH, REPORTS_TO, MANAGES, etc.',
  parameters: findRelatedEntitiesToolSchema,

  async execute(
    params: FindRelatedEntitiesParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = findRelatedEntitiesToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Finding related entities: start="${validated.entityValue}" (${validated.entityType}), maxDepth=${validated.maxDepth}, user=${userId}`
      );

      const resultsByDepth = await traverseGraph(
        validated.entityType as EntityType,
        validated.entityValue,
        userId,
        validated.maxDepth,
        validated.minConfidence,
        validated.relationshipTypes
      );

      if (resultsByDepth.size === 0) {
        return {
          message: `No related entities found for ${validated.entityType} "${validated.entityValue}" within ${validated.maxDepth} hop(s).`,
        };
      }

      // Calculate total entities found
      let totalEntities = 0;
      for (const nodes of resultsByDepth.values()) {
        totalEntities += nodes.length;
      }

      let message = `**Found ${totalEntities} related entit${totalEntities === 1 ? 'y' : 'ies'} for "${validated.entityValue}"** (${validated.entityType}):\n\n`;

      // Display results grouped by depth
      const depths = Array.from(resultsByDepth.keys()).sort((a, b) => a - b);

      for (const depth of depths) {
        const nodes = resultsByDepth.get(depth)!;
        const hopLabel = depth === 1 ? '1 hop away' : `${depth} hops away`;

        message += `**${hopLabel}** (${nodes.length}):\n`;

        // Group by type for cleaner display
        const byType = nodes.reduce((acc, node) => {
          if (!acc[node.type]) {
            acc[node.type] = [];
          }
          acc[node.type].push(node);
          return acc;
        }, {} as Record<string, EntityNode[]>);

        for (const [type, typeNodes] of Object.entries(byType)) {
          message += `\n  **${type}** (${typeNodes.length}):\n`;
          typeNodes.forEach((node) => {
            message += `    • ${node.value}`;
            if (node.pathFrom.length > 0) {
              message += ` (via: ${node.pathFrom.slice(-2).join(' → ')})`;
            }
            message += '\n';
          });
        }

        message += '\n';
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Graph traversal failed:`, error);
      throw new Error(
        `Failed to find related entities: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
