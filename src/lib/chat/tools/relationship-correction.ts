/**
 * Relationship Correction Tool
 * Detects and handles temporal relationship corrections from user messages.
 * When a user says something like "I'm not at Duetto anymore", this tool
 * finds the matching relationship and transitions it to status: 'former'.
 */

import { z } from 'zod';
import {
  getEntityRelationships,
  updateRelationship,
} from '@/lib/weaviate/relationships';
import type { InferredRelationship, RelationshipStatus } from '@/lib/relationships/types';

const LOG_PREFIX = '[RelationshipCorrection]';

/**
 * Patterns that indicate a relationship correction intent
 */
const CORRECTION_PATTERNS = [
  // Employment/organizational endings
  /i(?:'m| am) no(?:t| longer) (?:at|with|working (?:at|for)) (?:the )?(.+?)(?:anymore|any more)?$/i,
  /i left (?:the )?(.+?)$/i,
  /i(?:'ve| have) left (?:the )?(.+?)$/i,
  /i quit (?:my (?:job|position) (?:at|with) )?(?:the )?(.+?)$/i,
  /i(?:'ve| have) quit (?:my (?:job|position) (?:at|with) )?(?:the )?(.+?)$/i,
  /i don(?:'t|ot) work (?:at|for|with) (?:the )?(.+?) anymore$/i,
  /i(?:'m| am) not (?:a|an) .+ at (?:the )?(.+?) anymore$/i,
  /i resigned from (?:the )?(.+?)$/i,
  /i(?:'ve| have) resigned from (?:the )?(.+?)$/i,
  /i was laid off (?:from|by) (?:the )?(.+?)$/i,
  /i got laid off (?:from|by) (?:the )?(.+?)$/i,
  /(?:the )?(.+?) (?:and i|& i) parted ways$/i,
  /i(?:'m| am) no longer with (?:the )?(.+?)$/i,
  /i(?:'ve| have) moved on from (?:the )?(.+?)$/i,

  // Personal relationship endings
  /(.+?) and i (?:broke up|split up|separated|got divorced|ended things)$/i,
  /i(?:'m| am) not (?:with|seeing|dating) (.+?) anymore$/i,
  /i(?:'ve| have) broken up with (.+?)$/i,
  /(.+?) and i are no longer (?:together|married|dating)$/i,
  /i(?:'m| am) no longer (?:married to|dating|with) (.+?)$/i,

  // Project/team endings
  /i(?:'m| am) no(?:t| longer) (?:on|part of|working on) (?:the )?(.+?)(?: project| team)?$/i,
  /i(?:'ve| have) finished (?:with |working on )?(?:the )?(.+?)(?: project)?$/i,
  /i(?:'ve| have) completed (?:the )?(.+?)(?: project)?$/i,
];

/**
 * Interface for correction intent detection result
 */
export interface CorrectionIntent {
  detected: boolean;
  entityName: string | null;
  originalMessage: string;
  matchedPattern?: string;
}

/**
 * Interface for relationship correction result
 */
export interface CorrectionResult {
  success: boolean;
  message: string;
  updatedRelationship?: InferredRelationship;
  matchedRelationships?: InferredRelationship[];
}

/**
 * Detect if a message contains a relationship correction intent
 */
export function detectCorrectionIntent(message: string): CorrectionIntent {
  const trimmedMessage = message.trim();

  for (const pattern of CORRECTION_PATTERNS) {
    const match = trimmedMessage.match(pattern);
    if (match && match[1]) {
      const entityName = match[1].trim();
      // Filter out very short matches that are likely false positives
      if (entityName.length >= 2) {
        console.log(`${LOG_PREFIX} Detected correction intent for entity: "${entityName}"`);
        return {
          detected: true,
          entityName,
          originalMessage: message,
          matchedPattern: pattern.toString(),
        };
      }
    }
  }

  return {
    detected: false,
    entityName: null,
    originalMessage: message,
  };
}

/**
 * Find matching active relationships for an entity name
 */
async function findMatchingRelationships(
  entityName: string,
  userId: string
): Promise<InferredRelationship[]> {
  const normalizedName = entityName.toLowerCase();

  // Try to find relationships where this entity is the "to" side
  // (e.g., Person WORKS_FOR Company)
  // We search as both person and company since we don't know the type
  const [personRels, companyRels] = await Promise.all([
    getEntityRelationships('person', normalizedName, userId),
    getEntityRelationships('company', normalizedName, userId),
  ]);

  const allRels = [...personRels, ...companyRels];

  // Filter to only active relationships and match the entity name
  const activeMatches = allRels.filter((rel) => {
    // Must be active
    if (rel.status !== 'active' && rel.status !== 'unknown') {
      return false;
    }

    // Match entity name (partial match for flexibility)
    const fromMatch = rel.fromEntityValue.toLowerCase().includes(normalizedName) ||
                      normalizedName.includes(rel.fromEntityValue.toLowerCase());
    const toMatch = rel.toEntityValue.toLowerCase().includes(normalizedName) ||
                    normalizedName.includes(rel.toEntityValue.toLowerCase());

    return fromMatch || toMatch;
  });

  // Sort by confidence to prioritize high-confidence matches
  activeMatches.sort((a, b) => b.confidence - a.confidence);

  console.log(`${LOG_PREFIX} Found ${activeMatches.length} active relationships matching "${entityName}"`);

  return activeMatches;
}

/**
 * Correct a relationship by transitioning it to 'former' status
 */
export async function correctRelationship(
  entityName: string,
  userId: string,
  options?: {
    relationshipId?: string; // If specified, correct this specific relationship
    endDate?: string; // ISO date, defaults to today
  }
): Promise<CorrectionResult> {
  try {
    const endDate = options?.endDate || new Date().toISOString().split('T')[0];

    // If a specific relationship ID is provided, update it directly
    if (options?.relationshipId) {
      const updated = await updateRelationship(options.relationshipId, userId, {
        status: 'former' as RelationshipStatus,
        endDate,
        lastVerified: new Date().toISOString(),
      });

      if (updated) {
        console.log(`${LOG_PREFIX} Successfully corrected relationship ${options.relationshipId}`);
        return {
          success: true,
          message: `Updated your relationship with ${entityName} to 'former' status as of ${endDate}.`,
          updatedRelationship: updated,
        };
      } else {
        return {
          success: false,
          message: `Could not find relationship with ID ${options.relationshipId}.`,
        };
      }
    }

    // Otherwise, find matching relationships
    const matches = await findMatchingRelationships(entityName, userId);

    if (matches.length === 0) {
      return {
        success: false,
        message: `I couldn't find any active relationship with "${entityName}" to update.`,
        matchedRelationships: [],
      };
    }

    if (matches.length === 1) {
      // Single match - update it directly
      const rel = matches[0];
      const updated = await updateRelationship(rel.id!, userId, {
        status: 'former' as RelationshipStatus,
        endDate,
        lastVerified: new Date().toISOString(),
      });

      if (updated) {
        const relDescription = `${rel.fromEntityValue} ${rel.relationshipType.replace('_', ' ').toLowerCase()} ${rel.toEntityValue}`;
        console.log(`${LOG_PREFIX} Successfully corrected relationship: ${relDescription}`);
        return {
          success: true,
          message: `Updated your relationship "${relDescription}" to 'former' status as of ${endDate}.`,
          updatedRelationship: updated,
        };
      } else {
        return {
          success: false,
          message: `Failed to update the relationship. Please try again.`,
        };
      }
    }

    // Multiple matches - return them for user disambiguation
    console.log(`${LOG_PREFIX} Found ${matches.length} matching relationships - needs disambiguation`);
    return {
      success: false,
      message: `I found ${matches.length} relationships with "${entityName}". Please specify which one you mean.`,
      matchedRelationships: matches,
    };

  } catch (error) {
    console.error(`${LOG_PREFIX} Error correcting relationship:`, error);
    return {
      success: false,
      message: `An error occurred while updating the relationship: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Relationship correction tool parameters
 */
export const relationshipCorrectionParameters = z.object({
  entityName: z.string().describe('The name of the entity (company, person, project) to mark as former'),
  relationshipId: z.string().optional().describe('Optional: specific relationship ID if known'),
  endDate: z.string().optional().describe('Optional: end date in ISO format (YYYY-MM-DD). Defaults to today.'),
});

/**
 * Relationship correction tool definition
 */
export const correctRelationshipTool = {
  name: 'correct_relationship',
  description:
    'Correct a relationship in the knowledge graph when the user indicates they are no longer associated with an entity. ' +
    'Use this when the user says things like "I\'m not at [company] anymore", "I left [company]", ' +
    '"[person] and I broke up", or "I\'m no longer working on [project]". ' +
    'This updates the relationship status to "former" and sets the end date.',
  parameters: relationshipCorrectionParameters,

  /**
   * Execute relationship correction
   */
  async execute(
    params: z.infer<typeof relationshipCorrectionParameters>,
    userId: string
  ): Promise<CorrectionResult> {
    console.log(`${LOG_PREFIX} User ${userId} requesting relationship correction for: "${params.entityName}"`);

    const result = await correctRelationship(params.entityName, userId, {
      relationshipId: params.relationshipId,
      endDate: params.endDate,
    });

    return result;
  },
};
