/**
 * Create Entity Tool
 * Manually create new entities via chat
 */

import { z } from 'zod';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import { getWeaviateClient, ensureTenant } from '@/lib/weaviate/client';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Create Entity Tool]';

/**
 * Create Entity Tool Schema
 */
export const createEntityToolSchema = z.object({
  type: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of entity to create'),
  value: z.string().min(1).describe('The entity value (e.g., person name, company name)'),
  normalized: z
    .string()
    .optional()
    .describe('Optional normalized value (defaults to lowercase value)'),
  context: z
    .string()
    .optional()
    .describe('Optional context or description about this entity'),
  // Action item specific fields
  assignee: z
    .string()
    .optional()
    .describe('For action_item: who is assigned to this task'),
  deadline: z.string().optional().describe('For action_item: deadline (ISO date string)'),
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('For action_item: priority level'),
});

export type CreateEntityParams = z.infer<typeof createEntityToolSchema>;

/**
 * Create Entity Tool
 * Manually create a new entity with 100% confidence
 */
export const createEntityTool = {
  name: 'create_entity',
  description:
    'Manually create a new entity (person, company, project, tool, topic, location, or action item). Manual creations have 100% confidence. Use this when you need to add an entity that was not auto-extracted.',
  parameters: createEntityToolSchema,

  async execute(params: CreateEntityParams, userId: string): Promise<{ message: string }> {
    try {
      const validated = createEntityToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Creating ${validated.type} entity: "${validated.value}" for user ${userId}`
      );

      const client = await getWeaviateClient();
      const collectionName = COLLECTIONS[validated.type as EntityType];

      if (!collectionName) {
        throw new Error(`Unknown entity type: ${validated.type}`);
      }

      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      const tenantCollection = collection.withTenant(userId);

      // Prepare entity object with 100% confidence (manual creation)
      const entityObject: Record<string, any> = {
        value: validated.value,
        normalized: validated.normalized || validated.value.toLowerCase(),
        confidence: 1.0, // 100% confidence for manual creation
        source: 'manual' as const,
        sourceId: 'manual-creation',
        userId,
        extractedAt: new Date().toISOString(),
        context: validated.context || '',
      };

      // Add action_item specific fields if applicable
      if (validated.type === 'action_item') {
        entityObject.assignee = validated.assignee || '';
        entityObject.deadline = validated.deadline || '';
        entityObject.priority = validated.priority || 'medium';
      }

      // Insert to tenant-specific collection
      const result = await tenantCollection.data.insert(entityObject);

      console.log(
        `${LOG_PREFIX} Created ${validated.type} entity with UUID: ${result} (tenant: ${userId})`
      );

      let message = `✓ Created **${validated.type}** entity: **${validated.value}**`;

      if (validated.context) {
        message += `\n   Context: ${validated.context}`;
      }

      if (validated.type === 'action_item') {
        if (validated.assignee) {
          message += `\n   Assignee: ${validated.assignee}`;
        }
        if (validated.deadline) {
          message += `\n   Deadline: ${validated.deadline}`;
        }
        if (validated.priority) {
          message += `\n   Priority: ${validated.priority}`;
        }
      }

      message += `\n   Confidence: 100% (manual)`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to create entity:`, error);
      throw new Error(
        `Failed to create entity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
