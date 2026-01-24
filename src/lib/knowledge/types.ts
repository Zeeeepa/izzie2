/**
 * Knowledge Types
 *
 * Type definitions for the two-tier knowledge architecture.
 * Supports global, organization, and personal knowledge sources.
 */

import type {
  SharedKnowledge,
  NewSharedKnowledge,
  SharedKnowledgeType,
  SharedKnowledgeVisibility,
  Organization,
} from '../db/schema';

/**
 * Knowledge source tier
 */
export type KnowledgeSource = 'global' | 'organization' | 'personal';

/**
 * Unified knowledge result from any tier
 */
export interface KnowledgeResult {
  id: string;
  content: string;
  type: string;
  source: KnowledgeSource;
  title?: string;
  relevanceScore?: number;
  organizationId?: string;
  organizationName?: string;
}

/**
 * Options for knowledge retrieval
 */
export interface KnowledgeRetrievalOptions {
  /** Include global/core knowledge (default: true) */
  includeGlobal?: boolean;
  /** Include organization-scoped knowledge (default: true) */
  includeOrganization?: boolean;
  /** Include user-specific/personal knowledge (default: true) */
  includePersonal?: boolean;
  /** Filter by knowledge type */
  type?: SharedKnowledgeType;
  /** Maximum results to return */
  limit?: number;
  /** Minimum relevance score (0-1) */
  minRelevance?: number;
}

/**
 * Default retrieval options
 */
export const DEFAULT_RETRIEVAL_OPTIONS: Required<Omit<KnowledgeRetrievalOptions, 'type' | 'minRelevance'>> = {
  includeGlobal: true,
  includeOrganization: true,
  includePersonal: true,
  limit: 20,
};

/**
 * Re-export schema types for convenience
 */
export type {
  SharedKnowledge,
  NewSharedKnowledge,
  SharedKnowledgeType,
  SharedKnowledgeVisibility,
  Organization,
};
