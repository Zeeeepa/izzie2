/**
 * Memory Types
 *
 * Defines types for memory extraction and storage.
 * Memories capture facts, preferences, events, and context that don't
 * rise to entity level but are important for personalization.
 *
 * Key Distinction:
 * - Entities: Named things (Person, Company, Project, etc.)
 * - Memories: Facts, preferences, events, context
 * - All entities ARE memories, but not all memories are entities
 */

/**
 * Memory category types
 */
export type MemoryCategory =
  | 'preference'    // User likes/dislikes, habits
  | 'fact'          // Objective information
  | 'event'         // Something that happened/will happen
  | 'decision'      // A decision that was made
  | 'sentiment'     // Emotional context, feelings
  | 'reminder'      // Something to remember for later
  | 'relationship'; // How entities relate to each other

/**
 * Source type for memories
 */
export type MemorySource = 'email' | 'calendar' | 'chat' | 'manual';

/**
 * Core memory interface
 */
export interface Memory {
  id: string;
  userId: string;

  // Content
  content: string;           // The fact/memory itself
  category: MemoryCategory;  // Type of memory

  // Source tracking
  sourceType: MemorySource;  // Where the memory came from
  sourceId?: string;         // Email ID, calendar event ID, etc.
  sourceDate: Date;          // When the memory was created/observed

  // Temporal decay parameters
  importance: number;        // 0-1, affects decay rate
  decayRate: number;         // How fast memory fades (higher = faster decay)
  lastAccessed?: Date;       // Accessing refreshes memory
  expiresAt?: Date;          // Optional hard expiration

  // Relevance and quality
  confidence: number;        // 0-1, extraction confidence
  relatedEntities?: string[]; // Links to entity IDs (normalized names)
  tags?: string[];           // Searchable tags

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  isDeleted?: boolean;       // Soft delete flag
}

/**
 * Input for creating a new memory
 */
export interface CreateMemoryInput {
  userId: string;
  content: string;
  category: MemoryCategory;
  sourceType: MemorySource;
  sourceId?: string;
  sourceDate?: Date;
  importance?: number;       // Default: 0.5
  confidence?: number;       // Default: 0.8
  relatedEntities?: string[];
  tags?: string[];
  expiresAt?: Date;
}

/**
 * Extracted memory from text
 */
export interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  importance: number;
  confidence: number;
  relatedEntities?: string[];
  tags?: string[];
  expiresAt?: Date;
}

/**
 * Memory extraction result
 */
export interface MemoryExtractionResult {
  sourceId: string;
  sourceType: MemorySource;
  memories: ExtractedMemory[];
  extractedAt: Date;
  cost: number;  // API cost
  model: string; // Model used
}

/**
 * Memory search options
 */
export interface MemorySearchOptions {
  query: string;
  userId: string;
  categories?: MemoryCategory[];
  minStrength?: number;      // Minimum decay-weighted strength (0-1)
  minConfidence?: number;    // Minimum extraction confidence (0-1)
  minImportance?: number;    // Minimum importance value (0-1)
  relatedEntity?: string;    // Filter by related entity
  tags?: string[];
  limit?: number;
  sourceType?: MemorySource;
  includeExpired?: boolean;
}

/**
 * Memory with calculated strength
 */
export interface MemoryWithStrength extends Memory {
  strength: number;          // Current decay-weighted strength (0-1)
  ageInDays: number;
  daysSinceAccess: number;
}

/**
 * Default decay rates by category (per day)
 */
export const DECAY_RATES: Record<MemoryCategory, number> = {
  preference: 0.01,    // Very slow - preferences persist
  fact: 0.02,          // Slow - facts are stable
  relationship: 0.02,  // Slow - relationships persist
  decision: 0.03,      // Medium - decisions can change
  event: 0.05,         // Medium-fast - events become less relevant
  sentiment: 0.1,      // Fast - emotions are temporary
  reminder: 0.2,       // Very fast - reminders expire quickly
};

/**
 * Default importance values by category
 */
export const DEFAULT_IMPORTANCE: Record<MemoryCategory, number> = {
  preference: 0.8,     // High - user preferences are very important
  fact: 0.7,           // Medium-high - facts are important
  relationship: 0.7,   // Medium-high - relationships are important
  decision: 0.6,       // Medium - decisions are moderately important
  event: 0.5,          // Medium - events are moderately important
  sentiment: 0.4,      // Medium-low - sentiments are less important
  reminder: 0.6,       // Medium - reminders are moderately important
};
