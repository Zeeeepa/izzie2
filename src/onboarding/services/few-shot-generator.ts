/**
 * Few-Shot Example Generator
 *
 * Converts negative feedback with corrections into few-shot examples for prompt improvement.
 * These examples help the LLM learn from human corrections to improve extraction accuracy.
 */

import type { FeedbackRecord, FeedbackContext, ExtractedItem } from './feedback';
import { getFeedbackService, FeedbackService } from './feedback';
import type { Entity, InlineRelationship, EntityType, InlineRelationshipType } from '@/lib/extraction/types';

const LOG_PREFIX = '[FewShotGenerator]';

/**
 * A few-shot example for entity extraction
 */
export interface EntityFewShotExample {
  type: 'entity';
  /** Email context (subject, from, snippet) */
  context: {
    subject?: string;
    from?: string;
    snippet?: string;
  };
  /** What the model originally extracted (incorrect) */
  incorrectExtraction: {
    type: EntityType;
    value: string;
    confidence: number;
  };
  /** The corrected extraction from human feedback */
  correctExtraction: {
    type: EntityType;
    value: string;
    explanation?: string;
  };
}

/**
 * A few-shot example for relationship extraction
 */
export interface RelationshipFewShotExample {
  type: 'relationship';
  /** Email context (subject, from, snippet) */
  context: {
    subject?: string;
    from?: string;
    snippet?: string;
  };
  /** What the model originally extracted (incorrect) */
  incorrectExtraction: {
    relationshipType: InlineRelationshipType;
    source: string;
    target: string;
    confidence: number;
  };
  /** The corrected extraction from human feedback */
  correctExtraction: {
    relationshipType: InlineRelationshipType;
    source: string;
    target: string;
    explanation?: string;
  } | null; // null means "should not have extracted this"
}

/**
 * Union type for all few-shot examples
 */
export type FewShotExample = EntityFewShotExample | RelationshipFewShotExample;

/**
 * Options for generating few-shot examples
 */
export interface FewShotGeneratorOptions {
  /** Maximum number of examples to generate (default: 10) */
  maxExamples?: number;
  /** Only include examples with corrections (default: true) */
  requireCorrection?: boolean;
  /** Filter by entity type */
  entityTypes?: EntityType[];
  /** Filter by relationship type */
  relationshipTypes?: InlineRelationshipType[];
  /** Start date for filtering feedback */
  startDate?: Date;
  /** End date for filtering feedback */
  endDate?: Date;
}

export class FewShotGenerator {
  private feedbackService: FeedbackService;

  constructor(feedbackService?: FeedbackService) {
    this.feedbackService = feedbackService || getFeedbackService();
    console.log(`${LOG_PREFIX} Initialized`);
  }

  /**
   * Generate few-shot examples from negative feedback with corrections
   */
  generateExamples(options: FewShotGeneratorOptions = {}): FewShotExample[] {
    const {
      maxExamples = 10,
      requireCorrection = true,
      entityTypes,
      relationshipTypes,
      startDate,
      endDate,
    } = options;

    const records = this.feedbackService.getAllRecords();
    console.log(`${LOG_PREFIX} Processing ${records.length} feedback records`);

    // Filter to negative feedback (corrections)
    let filtered = records.filter((r) => r.feedback === 'negative');

    // Filter by correction requirement
    if (requireCorrection) {
      filtered = filtered.filter((r) => r.correction && r.correction.trim().length > 0);
    }

    // Filter by date range
    if (startDate) {
      filtered = filtered.filter((r) => new Date(r.timestamp) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((r) => new Date(r.timestamp) <= endDate);
    }

    // Filter by entity/relationship type
    if (entityTypes && entityTypes.length > 0) {
      filtered = filtered.filter(
        (r) => r.type === 'entity' && r.extracted.entityType &&
               entityTypes.includes(r.extracted.entityType as EntityType)
      );
    }
    if (relationshipTypes && relationshipTypes.length > 0) {
      filtered = filtered.filter(
        (r) => r.type === 'relationship' && r.extracted.relationshipType &&
               relationshipTypes.includes(r.extracted.relationshipType as InlineRelationshipType)
      );
    }

    // Convert to few-shot examples
    const examples: FewShotExample[] = [];

    for (const record of filtered) {
      if (examples.length >= maxExamples) break;

      const example = this.convertToExample(record);
      if (example) {
        examples.push(example);
      }
    }

    console.log(`${LOG_PREFIX} Generated ${examples.length} few-shot examples`);
    return examples;
  }

  /**
   * Convert a feedback record to a few-shot example
   */
  private convertToExample(record: FeedbackRecord): FewShotExample | null {
    const context = {
      subject: record.context.emailSubject,
      from: record.context.emailFrom,
      snippet: record.context.emailSnippet,
    };

    if (record.type === 'entity') {
      return this.convertEntityExample(record, context);
    } else {
      return this.convertRelationshipExample(record, context);
    }
  }

  /**
   * Convert entity feedback to a few-shot example
   */
  private convertEntityExample(
    record: FeedbackRecord,
    context: EntityFewShotExample['context']
  ): EntityFewShotExample | null {
    const extracted = record.extracted;

    if (!extracted.entityType) {
      console.warn(`${LOG_PREFIX} Entity record missing entityType:`, record.id);
      return null;
    }

    // Parse correction - expected format: "type:value" or just "value"
    const correction = this.parseEntityCorrection(record.correction, extracted.entityType);
    if (!correction) {
      return null;
    }

    return {
      type: 'entity',
      context,
      incorrectExtraction: {
        type: extracted.entityType as EntityType,
        value: extracted.value,
        confidence: extracted.confidence || 0.5,
      },
      correctExtraction: correction,
    };
  }

  /**
   * Convert relationship feedback to a few-shot example
   */
  private convertRelationshipExample(
    record: FeedbackRecord,
    context: RelationshipFewShotExample['context']
  ): RelationshipFewShotExample | null {
    const extracted = record.extracted;

    if (!extracted.relationshipType || !extracted.source || !extracted.target) {
      console.warn(`${LOG_PREFIX} Relationship record missing fields:`, record.id);
      return null;
    }

    // Parse correction - could be null (shouldn't extract) or corrected values
    const correction = this.parseRelationshipCorrection(
      record.correction,
      extracted.relationshipType
    );

    return {
      type: 'relationship',
      context,
      incorrectExtraction: {
        relationshipType: extracted.relationshipType as InlineRelationshipType,
        source: extracted.source,
        target: extracted.target,
        confidence: extracted.confidence || 0.5,
      },
      correctExtraction: correction,
    };
  }

  /**
   * Parse entity correction from feedback string
   * Supports formats:
   * - "value" - corrected value, same type
   * - "type:value" - corrected type and value
   * - "DELETE" - should not have extracted
   */
  private parseEntityCorrection(
    correction: string | undefined,
    defaultType: string
  ): EntityFewShotExample['correctExtraction'] | null {
    if (!correction || correction.trim().length === 0) {
      return null;
    }

    const trimmed = correction.trim();

    // Check for DELETE marker
    if (trimmed.toUpperCase() === 'DELETE') {
      return {
        type: defaultType as EntityType,
        value: '',
        explanation: 'This entity should not have been extracted',
      };
    }

    // Check for type:value format
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const type = trimmed.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmed.substring(colonIndex + 1).trim();

      // Validate type
      const validTypes: EntityType[] = ['person', 'company', 'project', 'tool', 'topic', 'location', 'action_item'];
      if (validTypes.includes(type as EntityType)) {
        return {
          type: type as EntityType,
          value,
        };
      }
    }

    // Default: same type, corrected value
    return {
      type: defaultType as EntityType,
      value: trimmed,
    };
  }

  /**
   * Parse relationship correction from feedback string
   * Supports formats:
   * - "DELETE" or empty - should not have extracted
   * - "RELATIONSHIP_TYPE source -> target" - full correction
   * - "source -> target" - same relationship type
   */
  private parseRelationshipCorrection(
    correction: string | undefined,
    defaultType: string
  ): RelationshipFewShotExample['correctExtraction'] {
    if (!correction || correction.trim().length === 0) {
      return null;
    }

    const trimmed = correction.trim();

    // Check for DELETE marker
    if (trimmed.toUpperCase() === 'DELETE') {
      return null;
    }

    // Try to parse "TYPE source -> target" format
    const arrowIndex = trimmed.indexOf('->');
    if (arrowIndex > 0) {
      const beforeArrow = trimmed.substring(0, arrowIndex).trim();
      const target = trimmed.substring(arrowIndex + 2).trim();

      // Check if beforeArrow starts with relationship type
      const words = beforeArrow.split(/\s+/);
      if (words.length >= 2) {
        const possibleType = words[0].toUpperCase();
        const source = words.slice(1).join(' ');

        // Validate relationship type
        const validTypes: InlineRelationshipType[] = [
          'WORKS_WITH', 'REPORTS_TO', 'WORKS_FOR', 'LEADS', 'WORKS_ON',
          'EXPERT_IN', 'LOCATED_IN', 'FRIEND_OF', 'FAMILY_OF', 'MARRIED_TO',
          'SIBLING_OF', 'PARTNERS_WITH', 'COMPETES_WITH', 'OWNS', 'RELATED_TO',
          'DEPENDS_ON', 'PART_OF', 'SUBTOPIC_OF', 'ASSOCIATED_WITH',
        ];

        if (validTypes.includes(possibleType as InlineRelationshipType)) {
          return {
            relationshipType: possibleType as InlineRelationshipType,
            source,
            target,
          };
        }

        // No valid type prefix, use default type
        return {
          relationshipType: defaultType as InlineRelationshipType,
          source: beforeArrow,
          target,
        };
      }

      // Simple "source -> target" format
      return {
        relationshipType: defaultType as InlineRelationshipType,
        source: beforeArrow,
        target,
      };
    }

    // Couldn't parse, return null (treat as DELETE)
    console.warn(`${LOG_PREFIX} Could not parse relationship correction: ${trimmed}`);
    return null;
  }

  /**
   * Format examples as a prompt section for LLM context
   */
  formatAsPromptSection(examples: FewShotExample[]): string {
    if (examples.length === 0) {
      return '';
    }

    const lines: string[] = [
      '## Learning from Previous Corrections',
      '',
      'The following examples show previous extraction errors and their corrections.',
      'Use these to improve your extraction accuracy:',
      '',
    ];

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];
      lines.push(`### Example ${i + 1}`);
      lines.push('');

      // Context
      if (example.context.subject || example.context.from || example.context.snippet) {
        lines.push('**Email Context:**');
        if (example.context.from) lines.push(`- From: ${example.context.from}`);
        if (example.context.subject) lines.push(`- Subject: ${example.context.subject}`);
        if (example.context.snippet) lines.push(`- Snippet: "${example.context.snippet}"`);
        lines.push('');
      }

      if (example.type === 'entity') {
        lines.push('**Incorrect Extraction:**');
        lines.push(`- Type: ${example.incorrectExtraction.type}`);
        lines.push(`- Value: "${example.incorrectExtraction.value}"`);
        lines.push('');

        if (example.correctExtraction.value) {
          lines.push('**Correct Extraction:**');
          lines.push(`- Type: ${example.correctExtraction.type}`);
          lines.push(`- Value: "${example.correctExtraction.value}"`);
        } else {
          lines.push('**Correction:** This should NOT have been extracted.');
        }
      } else {
        lines.push('**Incorrect Extraction:**');
        lines.push(`- Relationship: ${example.incorrectExtraction.source} -[${example.incorrectExtraction.relationshipType}]-> ${example.incorrectExtraction.target}`);
        lines.push('');

        if (example.correctExtraction) {
          lines.push('**Correct Extraction:**');
          lines.push(`- Relationship: ${example.correctExtraction.source} -[${example.correctExtraction.relationshipType}]-> ${example.correctExtraction.target}`);
        } else {
          lines.push('**Correction:** This relationship should NOT have been extracted.');
        }
      }

      if (example.type === 'entity' && example.correctExtraction.explanation) {
        lines.push(`- Note: ${example.correctExtraction.explanation}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get statistics about available feedback for few-shot generation
   */
  getStats(): {
    totalFeedback: number;
    negativeFeedback: number;
    withCorrections: number;
    byType: { entity: number; relationship: number };
  } {
    const records = this.feedbackService.getAllRecords();
    const negative = records.filter((r) => r.feedback === 'negative');
    const withCorrections = negative.filter((r) => r.correction && r.correction.trim().length > 0);

    return {
      totalFeedback: records.length,
      negativeFeedback: negative.length,
      withCorrections: withCorrections.length,
      byType: {
        entity: negative.filter((r) => r.type === 'entity').length,
        relationship: negative.filter((r) => r.type === 'relationship').length,
      },
    };
  }
}

// Singleton instance
let fewShotGeneratorInstance: FewShotGenerator | null = null;

export function getFewShotGenerator(feedbackService?: FeedbackService): FewShotGenerator {
  if (!fewShotGeneratorInstance || feedbackService) {
    fewShotGeneratorInstance = new FewShotGenerator(feedbackService);
  }
  return fewShotGeneratorInstance;
}
