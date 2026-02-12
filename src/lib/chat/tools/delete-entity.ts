/**
 * Delete Entity Tool
 * Delete entities with confirmation flow via chat
 */

import { z } from 'zod';
import { searchEntities } from '@/lib/weaviate/entities';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import { getWeaviateClient, ensureTenant } from '@/lib/weaviate/client';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Delete Entity Tool]';

/**
 * Delete Entity Tool Schema
 */
export const deleteEntityToolSchema = z.object({
  type: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of entity to delete'),
  value: z.string().min(1).describe('The entity value to search for and delete'),
  confirm: z
    .boolean()
    .describe(
      'REQUIRED: Must be true to confirm deletion. This is a safety check to prevent accidental deletions.'
    ),
});

export type DeleteEntityParams = z.infer<typeof deleteEntityToolSchema>;

/**
 * Delete Entity Tool
 * Delete an existing entity with confirmation
 */
export const deleteEntityTool = {
  name: 'delete_entity',
  description:
    'Delete an existing entity. IMPORTANT: Requires explicit confirmation (confirm: true) to prevent accidental deletions. Search for the entity by value and type, then delete it.',
  parameters: deleteEntityToolSchema,

  async execute(params: DeleteEntityParams, userId: string): Promise<{ message: string }> {
    try {
      const validated = deleteEntityToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Delete request for ${validated.type} entity: "${validated.value}" for user ${userId}`
      );

      // Safety check: require explicit confirmation
      if (!validated.confirm) {
        return {
          message: `⚠️ **Deletion requires confirmation**\n\nTo delete **${validated.type}** entity "${validated.value}", you must set confirm to true.\n\nExample: delete_entity({ type: "${validated.type}", value: "${validated.value}", confirm: true })`,
        };
      }

      // First, search for the entity to verify it exists
      const entities = await searchEntities(validated.value, userId, {
        entityType: validated.type as EntityType,
        limit: 1,
        minConfidence: 0, // Find any confidence level
      });

      if (entities.length === 0) {
        return {
          message: `❌ Entity not found: **${validated.type}** with value "${validated.value}". Nothing to delete.`,
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
        returnProperties: ['value', 'confidence', 'context'],
        filters: tenantCollection.filter.byProperty('value').equal(validated.value),
      });

      if (result.objects.length === 0) {
        return {
          message: `❌ Entity not found in database: **${validated.type}** with value "${validated.value}".`,
        };
      }

      const entityUuid = result.objects[0].uuid;
      const entityObj = result.objects[0].properties;

      // Delete the entity
      await tenantCollection.data.deleteById(entityUuid);

      console.log(
        `${LOG_PREFIX} Deleted ${validated.type} entity UUID ${entityUuid} (tenant: ${userId})`
      );

      // Build success message
      let message = `✓ Deleted **${validated.type}** entity: **${validated.value}**`;

      if (entityObj.context) {
        message += `\n   Context: "${entityObj.context}"`;
      }

      const confidence = typeof entityObj.confidence === 'number' ? entityObj.confidence : 0;
      message += `\n   Confidence: ${Math.round(confidence * 100)}%`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to delete entity:`, error);
      throw new Error(
        `Failed to delete entity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
