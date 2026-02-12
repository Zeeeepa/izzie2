/**
 * Update Entity Tool
 * Update existing entity information via chat
 */

import { z } from 'zod';
import { searchEntities } from '@/lib/weaviate/entities';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import { getWeaviateClient, ensureTenant } from '@/lib/weaviate/client';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Update Entity Tool]';

/**
 * Update Entity Tool Schema
 */
export const updateEntityToolSchema = z.object({
  type: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of entity to update'),
  value: z.string().min(1).describe('The entity value to search for and update'),
  updates: z.object({
    newValue: z.string().optional().describe('New entity value (rename the entity)'),
    context: z.string().optional().describe('Update context/description'),
    assignee: z.string().optional().describe('For action_item: update assignee'),
    deadline: z.string().optional().describe('For action_item: update deadline'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('For action_item: update priority'),
  }).describe('Fields to update (only provided fields will be updated)'),
});

export type UpdateEntityParams = z.infer<typeof updateEntityToolSchema>;

/**
 * Update Entity Tool
 * Find and update an existing entity
 */
export const updateEntityTool = {
  name: 'update_entity',
  description:
    'Update an existing entity. Search for the entity by value and type, then update specified fields. Only provided fields will be updated (partial update).',
  parameters: updateEntityToolSchema,

  async execute(params: UpdateEntityParams, userId: string): Promise<{ message: string }> {
    try {
      const validated = updateEntityToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Updating ${validated.type} entity: "${validated.value}" for user ${userId}`
      );

      // First, search for the entity to get its UUID
      const entities = await searchEntities(validated.value, userId, {
        entityType: validated.type as EntityType,
        limit: 1,
        minConfidence: 0, // Find any confidence level
      });

      if (entities.length === 0) {
        return {
          message: `❌ Entity not found: **${validated.type}** with value "${validated.value}". Please create it first using create_entity.`,
        };
      }

      const entity = entities[0];
      const client = await getWeaviateClient();
      const collectionName = COLLECTIONS[validated.type as EntityType];

      if (!collectionName) {
        throw new Error(`Unknown entity type: ${validated.type}`);
      }

      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      const tenantCollection = collection.withTenant(userId);

      // Fetch the full object to get its UUID
      const result = await tenantCollection.query.fetchObjects({
        limit: 1,
        returnProperties: ['value', 'normalized'],
        filters: tenantCollection.filter.byProperty('value').equal(validated.value),
      });

      if (result.objects.length === 0) {
        return {
          message: `❌ Entity not found in database: **${validated.type}** with value "${validated.value}".`,
        };
      }

      const entityUuid = result.objects[0].uuid;

      // Build update object with only provided fields
      const updateData: Record<string, any> = {};
      const updates = validated.updates;

      if (updates.newValue !== undefined) {
        updateData.value = updates.newValue;
        updateData.normalized = updates.newValue.toLowerCase();
      }

      if (updates.context !== undefined) {
        updateData.context = updates.context;
      }

      // Action item specific updates
      if (validated.type === 'action_item') {
        if (updates.assignee !== undefined) {
          updateData.assignee = updates.assignee;
        }
        if (updates.deadline !== undefined) {
          updateData.deadline = updates.deadline;
        }
        if (updates.priority !== undefined) {
          updateData.priority = updates.priority;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          message: `⚠️ No updates provided for **${validated.type}** entity "${validated.value}".`,
        };
      }

      // Update the entity
      await tenantCollection.data.update({
        id: entityUuid,
        properties: updateData,
      });

      console.log(
        `${LOG_PREFIX} Updated ${validated.type} entity UUID ${entityUuid} (tenant: ${userId})`
      );

      // Build success message
      let message = `✓ Updated **${validated.type}** entity: **${validated.value}**\n\nChanges:`;

      if (updates.newValue) {
        message += `\n   • Value: "${validated.value}" → "${updates.newValue}"`;
      }
      if (updates.context) {
        message += `\n   • Context: "${updates.context}"`;
      }
      if (updates.assignee) {
        message += `\n   • Assignee: ${updates.assignee}`;
      }
      if (updates.deadline) {
        message += `\n   • Deadline: ${updates.deadline}`;
      }
      if (updates.priority) {
        message += `\n   • Priority: ${updates.priority}`;
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to update entity:`, error);
      throw new Error(
        `Failed to update entity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
