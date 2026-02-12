/**
 * Create Relationship Tool
 * Manually create relationships between entities via chat
 */

import { z } from 'zod';
import { saveRelationships } from '@/lib/weaviate/relationships';
import type { InferredRelationship, RelationshipType } from '@/lib/relationships/types';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Create Relationship Tool]';

/**
 * Create Relationship Tool Schema
 */
export const createRelationshipToolSchema = z.object({
  fromEntityType: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of the source entity'),
  fromEntityValue: z.string().min(1).describe('Value of the source entity'),
  toEntityType: z
    .enum(['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'])
    .describe('Type of the target entity'),
  toEntityValue: z.string().min(1).describe('Value of the target entity'),
  relationshipType: z
    .enum([
      'WORKS_FOR',
      'WORKS_WITH',
      'REPORTS_TO',
      'MANAGES',
      'LOCATED_IN',
      'PARTICIPATES_IN',
      'OWNS',
      'MEMBER_OF',
      'RELATED_TO',
    ])
    .describe('Type of relationship between entities'),
  evidence: z
    .string()
    .optional()
    .describe('Optional evidence or context for this relationship'),
  // Temporal qualifier fields
  startDate: z.string().optional().describe('Optional start date (ISO format)'),
  endDate: z.string().optional().describe('Optional end date (ISO format)'),
  status: z
    .enum(['active', 'former', 'future', 'unknown'])
    .optional()
    .describe('Relationship status (default: active)'),
  roleTitle: z.string().optional().describe('Optional role title (e.g., "Senior Engineer")'),
});

export type CreateRelationshipParams = z.infer<typeof createRelationshipToolSchema>;

/**
 * Create Relationship Tool
 * Manually create a relationship with 100% confidence
 */
export const createRelationshipTool = {
  name: 'create_relationship',
  description:
    'Manually create a relationship between two entities. Specify the source entity, target entity, and relationship type. Manual relationships have 100% confidence. Use this when you need to add a relationship that was not auto-inferred.',
  parameters: createRelationshipToolSchema,

  async execute(params: CreateRelationshipParams, userId: string): Promise<{ message: string }> {
    try {
      const validated = createRelationshipToolSchema.parse(params);

      console.log(
        `${LOG_PREFIX} Creating relationship: ${validated.fromEntityType}:"${validated.fromEntityValue}" --[${validated.relationshipType}]--> ${validated.toEntityType}:"${validated.toEntityValue}" for user ${userId}`
      );

      // Create relationship object
      const relationship: InferredRelationship = {
        fromEntityType: validated.fromEntityType as EntityType,
        fromEntityValue: validated.fromEntityValue,
        toEntityType: validated.toEntityType as EntityType,
        toEntityValue: validated.toEntityValue,
        relationshipType: validated.relationshipType as RelationshipType,
        confidence: 1.0, // 100% confidence for manual creation
        evidence: validated.evidence || 'Manually created via chat',
        sourceId: 'manual-creation',
        userId,
        inferredAt: new Date().toISOString(),
        // Temporal qualifiers
        startDate: validated.startDate,
        endDate: validated.endDate,
        status: validated.status || 'active',
        roleTitle: validated.roleTitle,
      };

      // Save to Weaviate (handles deduplication)
      const savedCount = await saveRelationships([relationship], userId);

      if (savedCount === 0) {
        return {
          message: `⚠️ Relationship already exists:\n   ${validated.fromEntityValue} (${validated.fromEntityType}) --[${validated.relationshipType}]--> ${validated.toEntityValue} (${validated.toEntityType})`,
        };
      }

      console.log(`${LOG_PREFIX} Created relationship (tenant: ${userId})`);

      // Build success message
      let message = `✓ Created relationship:\n   **${validated.fromEntityValue}** (${validated.fromEntityType})`;
      message += `\n   --[${validated.relationshipType}]-->\n   **${validated.toEntityValue}** (${validated.toEntityType})`;

      if (validated.evidence) {
        message += `\n\nEvidence: "${validated.evidence}"`;
      }

      if (validated.status) {
        message += `\nStatus: ${validated.status}`;
      }

      if (validated.roleTitle) {
        message += `\nRole: ${validated.roleTitle}`;
      }

      if (validated.startDate) {
        message += `\nStart Date: ${validated.startDate}`;
      }

      if (validated.endDate) {
        message += `\nEnd Date: ${validated.endDate}`;
      }

      message += `\n\nConfidence: 100% (manual)`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to create relationship:`, error);
      throw new Error(
        `Failed to create relationship: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
