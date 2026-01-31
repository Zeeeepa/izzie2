/**
 * Classifier Service
 *
 * Thin wrapper around EntityExtractor for the onboarding pipeline.
 * Handles NLP + LLM classification of emails to extract entities and relationships.
 */

import { EntityExtractor, getEntityExtractor } from '@/lib/extraction/entity-extractor';
import type { ExtractionResult, ExtractionConfig } from '@/lib/extraction/types';
import type { Email } from '@/lib/google/types';

/**
 * Simplified user identity for classifier context
 * Compatible with UserIdentity from lib/extraction/user-identity.ts
 */
interface SimpleUserIdentity {
  email: string;
  name?: string;
  aliases: string[];
}

/**
 * Full user identity expected by EntityExtractor
 */
interface FullUserIdentity {
  userId: string;
  primaryName: string;
  primaryEmail: string;
  aliases: string[];
  emailAliases: string[];
}

const LOG_PREFIX = '[Classifier]';

export class ClassifierService {
  private extractor: EntityExtractor;

  constructor(config?: Partial<ExtractionConfig>) {
    this.extractor = getEntityExtractor(config);
    console.log(`${LOG_PREFIX} Initialized with config:`, config);
  }

  /**
   * Set user identity for extraction context
   * Helps the extractor understand who "I", "me", "my" refers to in emails
   */
  setUserIdentity(identity: SimpleUserIdentity): void {
    // Convert simple identity to full identity expected by extractor
    const fullIdentity: FullUserIdentity = {
      userId: 'onboarding-test-user',
      primaryName: identity.name || identity.email.split('@')[0],
      primaryEmail: identity.email,
      aliases: identity.aliases,
      emailAliases: [identity.email],
    };
    this.extractor.setUserIdentity(fullIdentity as any);
    console.log(`${LOG_PREFIX} Set user identity:`, identity.email);
  }

  /**
   * Classify a single email
   * Extracts entities, relationships, and spam classification
   */
  async classifyEmail(email: Email): Promise<ExtractionResult> {
    console.log(`${LOG_PREFIX} Classifying email: ${email.id} - ${email.subject}`);

    try {
      const result = await this.extractor.extractFromEmail(email);

      console.log(
        `${LOG_PREFIX} Email ${email.id}: ` +
        `${result.entities.length} entities, ` +
        `${result.relationships.length} relationships, ` +
        `spam: ${result.spam.isSpam} (${result.spam.spamScore})`
      );

      return result;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to classify email ${email.id}:`, error);

      // Return empty result on error
      return {
        emailId: email.id,
        entities: [],
        relationships: [],
        spam: { isSpam: false, spamScore: 0 },
        extractedAt: new Date(),
        cost: 0,
        model: 'error',
      };
    }
  }

  /**
   * Classify a batch of emails
   * Returns results in the same order as input
   */
  async classifyBatch(emails: Email[]): Promise<ExtractionResult[]> {
    console.log(`${LOG_PREFIX} Classifying batch of ${emails.length} emails`);

    const results: ExtractionResult[] = [];

    for (const email of emails) {
      const result = await this.classifyEmail(email);
      results.push(result);
    }

    const totalEntities = results.reduce((sum, r) => sum + r.entities.length, 0);
    const totalRelationships = results.reduce((sum, r) => sum + r.relationships.length, 0);
    const spamCount = results.filter((r) => r.spam.isSpam).length;

    console.log(
      `${LOG_PREFIX} Batch complete: ` +
      `${totalEntities} entities, ` +
      `${totalRelationships} relationships, ` +
      `${spamCount} spam emails`
    );

    return results;
  }

  /**
   * Get the underlying extractor for advanced operations
   */
  getExtractor(): EntityExtractor {
    return this.extractor;
  }
}

// Singleton instance
let classifierServiceInstance: ClassifierService | null = null;

export function getClassifierService(
  config?: Partial<ExtractionConfig>
): ClassifierService {
  if (!classifierServiceInstance || config) {
    classifierServiceInstance = new ClassifierService(config);
  }
  return classifierServiceInstance;
}
