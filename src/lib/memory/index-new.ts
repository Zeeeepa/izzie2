/**
 * Memory System
 *
 * Comprehensive memory extraction and management system with temporal decay.
 *
 * Key Features:
 * - Extract memories from emails and other text sources
 * - Store memories in Weaviate with semantic search
 * - Temporal decay algorithm for relevance over time
 * - Decay-weighted retrieval and ranking
 *
 * Usage:
 *
 * ```typescript
 * import {
 *   extractMemoriesFromEmail,
 *   saveMemories,
 *   searchMemories,
 *   calculateMemoryStrength
 * } from '@/lib/memory';
 *
 * // Extract memories from an email
 * const result = await extractMemoriesFromEmail(email, userIdentity);
 *
 * // Save to Weaviate
 * const inputs = result.memories.map(m => ({
 *   userId: 'user-123',
 *   content: m.content,
 *   category: m.category,
 *   sourceType: 'email',
 *   sourceId: email.id,
 *   sourceDate: email.date,
 *   importance: m.importance,
 *   confidence: m.confidence,
 * }));
 * await saveMemories(inputs);
 *
 * // Search with decay-weighted relevance
 * const memories = await searchMemories({
 *   query: 'meeting preferences',
 *   userId: 'user-123',
 *   minStrength: 0.5, // Only memories with strength ≥ 0.5
 * });
 *
 * // Check memory strength
 * const strength = calculateMemoryStrength(memory);
 * console.log(`Memory strength: ${strength.toFixed(2)}`);
 * ```
 */

// Types
export type {
  Memory,
  MemoryCategory,
  MemorySource,
  CreateMemoryInput,
  ExtractedMemory,
  MemoryExtractionResult,
  MemorySearchOptions,
  MemoryWithStrength,
} from './types';

export { DECAY_RATES, DEFAULT_IMPORTANCE } from './types';

// Extraction
export {
  extractMemoriesFromEmail,
  extractMemoriesFromText,
  batchExtractMemories,
} from './extraction';

// Storage
export {
  initializeMemorySchema,
  saveMemory,
  saveMemories,
  getMemoryById,
  refreshMemoryAccess,
  deleteMemory,
  hardDeleteMemory,
  getAllMemories,
  getMemoryStats,
} from './storage';

// Retrieval
export {
  searchMemories,
  getRecentMemories,
  getMemoriesByCategory,
  getMemoriesByEntity,
  getMemoriesByTags,
  getMemoriesBySource,
} from './retrieval';

// Decay
export {
  calculateMemoryStrength,
  addStrengthToMemory,
  rankMemoriesByRelevance,
  filterByStrength,
  calculateHalfLife,
  predictDecayDate,
  refreshMemory,
  getDecayStats,
} from './decay';
