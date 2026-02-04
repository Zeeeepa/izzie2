/**
 * Entity Extraction Module
 *
 * Exports entity extraction service and related types.
 */

export { EntityExtractor, getEntityExtractor } from './entity-extractor';
export { buildExtractionPrompt, buildBatchExtractionPrompt } from './prompts';
export {
  convertToInferredRelationship,
  convertToInferredRelationships,
  deduplicateInlineRelationships,
} from './relationship-converter';
export type {
  EntityType,
  Entity,
  InlineRelationship,
  InlineRelationshipType,
  ExtractionResult,
  CalendarExtractionResult,
  ExtractionConfig,
  EntityFrequency,
  EntityCoOccurrence,
  ExtractionStats,
} from './types';
export { DEFAULT_EXTRACTION_CONFIG } from './types';

// Entity Resolution (Phase 1)
export {
  jaroWinklerSimilarity,
  calculateMatchScore,
  findPotentialMatches,
  createMergeSuggestions,
  extendEntitiesWithIdentity,
  MIN_MATCH_THRESHOLD,
  AUTO_ACCEPT_THRESHOLD,
  REVIEW_THRESHOLD,
} from './entity-matcher';
export type { MatchResult, ExtendedEntity } from './entity-matcher';

// Post-processing filters with identity tagging
export { tagSelfEntity, applyPostFilters, filterSelfEntities } from './post-filters';
export type { FilterOptions, FilterStats, FilterResult } from './post-filters';
