/**
 * Entity Merge Service
 *
 * Handles autonomous merging of high-confidence entity duplicates.
 * Automatically applies merges when confidence >= 0.95 to reduce manual work.
 */

import { dbClient } from '@/lib/db';
import { mergeSuggestions, MERGE_SUGGESTION_STATUS } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { mergeEntities } from './deduplication';
import type { EntityType } from '../extraction/types';

const LOG_PREFIX = '[Merge Service]';

// Get Drizzle instance from NeonClient
const db = dbClient.getDb();

/**
 * Auto-apply threshold - merges with confidence >= 0.95 are automatically applied
 */
export const AUTO_APPLY_THRESHOLD = 0.95;

/**
 * Create a merge suggestion and auto-apply if confidence is high enough
 *
 * @param userId - User ID who owns the entities
 * @param entity1Type - Type of first entity
 * @param entity1Value - Normalized value of first entity (keep this one)
 * @param entity2Type - Type of second entity
 * @param entity2Value - Normalized value of second entity (merge into first)
 * @param confidence - Confidence score (0-1)
 * @param matchReason - Explanation of why entities match
 * @returns Created merge suggestion with status
 */
export async function createMergeSuggestion(params: {
  userId: string;
  entity1Type: EntityType;
  entity1Value: string;
  entity2Type: EntityType;
  entity2Value: string;
  confidence: number;
  matchReason: string;
}): Promise<{
  id: string;
  status: string;
  autoApplied: boolean;
}> {
  const { userId, entity1Type, entity1Value, entity2Type, entity2Value, confidence, matchReason } = params;

  // Determine if this should be auto-applied
  const shouldAutoApply = confidence >= AUTO_APPLY_THRESHOLD;
  const status = shouldAutoApply ? MERGE_SUGGESTION_STATUS.AUTO_APPLIED : MERGE_SUGGESTION_STATUS.PENDING;

  console.log(
    `${LOG_PREFIX} Creating merge suggestion: ${entity2Value} → ${entity1Value} (confidence: ${confidence.toFixed(3)}, auto-apply: ${shouldAutoApply})`
  );

  // Create the suggestion record
  const [suggestion] = await db
    .insert(mergeSuggestions)
    .values({
      userId,
      entity1Type,
      entity1Value,
      entity2Type,
      entity2Value,
      confidence,
      matchReason,
      status,
      appliedAt: shouldAutoApply ? new Date() : null,
      appliedBy: shouldAutoApply ? 'system_auto' : null,
    })
    .returning();

  // Auto-apply if confidence is high enough
  if (shouldAutoApply) {
    try {
      await autoApplyMerge({
        suggestionId: suggestion.id,
        userId,
        keepEntityId: `${entity1Type}-0-${entity1Value}`,
        mergeEntityId: `${entity2Type}-0-${entity2Value}`,
      });

      console.log(`${LOG_PREFIX} Successfully auto-applied merge: ${entity2Value} → ${entity1Value}`);

      return {
        id: suggestion.id,
        status: MERGE_SUGGESTION_STATUS.AUTO_APPLIED,
        autoApplied: true,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to auto-apply merge:`, error);

      // Update suggestion status to pending if auto-apply failed
      await db
        .update(mergeSuggestions)
        .set({
          status: MERGE_SUGGESTION_STATUS.PENDING,
          appliedAt: null,
          appliedBy: null,
        })
        .where(eq(mergeSuggestions.id, suggestion.id));

      throw error;
    }
  }

  return {
    id: suggestion.id,
    status: MERGE_SUGGESTION_STATUS.PENDING,
    autoApplied: false,
  };
}

/**
 * Auto-apply a merge suggestion
 *
 * Merges duplicate entity into primary entity in Weaviate.
 *
 * @param suggestionId - ID of the merge suggestion
 * @param userId - User ID who owns the entities
 * @param keepEntityId - Entity ID to keep (format: "type-index-normalizedValue")
 * @param mergeEntityId - Entity ID to merge/delete (format: "type-index-normalizedValue")
 */
async function autoApplyMerge(params: {
  suggestionId: string;
  userId: string;
  keepEntityId: string;
  mergeEntityId: string;
}): Promise<void> {
  const { suggestionId, userId, keepEntityId, mergeEntityId } = params;

  console.log(
    `${LOG_PREFIX} Auto-applying merge: ${mergeEntityId} → ${keepEntityId} (suggestion: ${suggestionId})`
  );

  // Perform the actual merge in Weaviate
  const result = await mergeEntities(userId, keepEntityId, mergeEntityId);

  if (!result.success) {
    throw new Error(`Merge failed: ${result.message}`);
  }

  console.log(`${LOG_PREFIX} Merge completed successfully: ${result.message}`);
}

/**
 * Get merge statistics for a user
 *
 * @param userId - User ID
 * @returns Statistics about merge suggestions
 */
export async function getMergeStats(userId: string): Promise<{
  totalSuggestions: number;
  pendingSuggestions: number;
  autoApplied: number;
  manuallyAccepted: number;
  rejected: number;
  autoApplyRate: number;
}> {
  const suggestions = await db
    .select()
    .from(mergeSuggestions)
    .where(eq(mergeSuggestions.userId, userId));

  const totalSuggestions = suggestions.length;
  const pendingSuggestions = suggestions.filter(
    (s) => s.status === MERGE_SUGGESTION_STATUS.PENDING
  ).length;
  const autoApplied = suggestions.filter(
    (s) => s.status === MERGE_SUGGESTION_STATUS.AUTO_APPLIED
  ).length;
  const manuallyAccepted = suggestions.filter(
    (s) => s.status === MERGE_SUGGESTION_STATUS.ACCEPTED
  ).length;
  const rejected = suggestions.filter((s) => s.status === MERGE_SUGGESTION_STATUS.REJECTED).length;

  const autoApplyRate = totalSuggestions > 0 ? autoApplied / totalSuggestions : 0;

  return {
    totalSuggestions,
    pendingSuggestions,
    autoApplied,
    manuallyAccepted,
    rejected,
    autoApplyRate,
  };
}
