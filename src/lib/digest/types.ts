/**
 * Digest Types
 *
 * Type definitions for daily digest generation and delivery.
 * Digests aggregate and summarize user information from various sources
 * (calendar, email, tasks) into prioritized, actionable summaries.
 */

/**
 * Source types that can contribute items to a digest
 */
export type DigestItemSource = 'calendar' | 'email' | 'task' | 'drive' | 'notification';

/**
 * Digest types based on time of day
 */
export type DigestType = 'morning' | 'evening';

/**
 * Urgency levels for digest items
 */
export type DigestUrgency = 'low' | 'medium' | 'high' | 'critical';

/**
 * Delivery channels for digests
 */
export type DigestChannel = 'telegram' | 'email';

/**
 * Single item in a digest
 */
export interface DigestItem {
  /** Unique identifier for the item */
  id: string;
  /** Type/category of the item */
  type: string;
  /** Short title or subject */
  title: string;
  /** Brief summary of the item */
  summary: string;
  /** Relevance score (0-100) */
  relevanceScore: number;
  /** Urgency level */
  urgency: DigestUrgency;
  /** Whether the item requires user action */
  actionable: boolean;
  /** Source of the item */
  source: DigestItemSource;
  /** When the item was created or is scheduled */
  timestamp: string;
  /** Additional source-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Statistics about a generated digest
 */
export interface DigestStats {
  /** Total items considered */
  totalItemsConsidered: number;
  /** Items included in digest */
  itemsIncluded: number;
  /** Items filtered out by relevance threshold */
  itemsFilteredByRelevance: number;
  /** Breakdown by source */
  bySource: Record<DigestItemSource, number>;
  /** Breakdown by urgency */
  byUrgency: Record<DigestUrgency, number>;
  /** Time taken to generate digest in milliseconds */
  generationTimeMs: number;
}

/**
 * A section of the digest containing categorized items
 */
export interface DigestSection {
  /** Section title */
  title: string;
  /** Items in this section */
  items: DigestItem[];
}

/**
 * Full digest content structure
 */
export interface DigestContent {
  /** User ID this digest is for */
  userId: string;
  /** Type of digest */
  digestType: DigestType;
  /** When the digest was generated (ISO 8601) */
  generatedAt: string;
  /** User's timezone */
  timezone: string;
  /** Organized sections of the digest */
  sections: {
    /** Top priority items requiring immediate attention */
    topPriority: DigestItem[];
    /** Upcoming events and deadlines */
    upcoming: DigestItem[];
    /** Items that need attention but aren't urgent */
    needsAttention: DigestItem[];
    /** FYI items for awareness */
    informational: DigestItem[];
  };
  /** Statistics about the digest generation */
  stats: DigestStats;
}

/**
 * User preferences for digest delivery
 */
export interface DigestPreferences {
  /** User ID */
  userId: string;
  /** Whether digests are enabled */
  enabled: boolean;
  /** Morning digest delivery time (HH:mm format) */
  morningTime: string;
  /** Evening digest delivery time (HH:mm format) */
  eveningTime: string;
  /** User's timezone (IANA identifier) */
  timezone: string;
  /** Delivery channels to use */
  channels: DigestChannel[];
  /** Minimum relevance score for items to be included (0-100) */
  minRelevanceScore: number;
}

/**
 * Result of delivering a digest to a single channel
 */
export interface DigestDeliveryResult {
  /** Delivery channel */
  channel: DigestChannel;
  /** Whether delivery succeeded */
  success: boolean;
  /** Timestamp of delivery attempt (ISO 8601) */
  deliveredAt: string;
  /** Error message if delivery failed */
  error?: string;
  /** Message ID from the delivery channel */
  messageId?: string;
}

/**
 * Result of digest generation and delivery
 */
export interface DigestGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** The generated digest (if successful) */
  digest?: DigestContent;
  /** Results from each delivery channel */
  deliveryResults: DigestDeliveryResult[];
  /** Error message if generation failed */
  error?: string;
}
