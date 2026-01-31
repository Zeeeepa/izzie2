/**
 * Feedback Service
 *
 * Stores human feedback on extracted entities and relationships for RLHF training.
 * Supports in-memory storage with JSONL export for ML training pipelines.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_PREFIX = '[Feedback]';

/**
 * Context about the source email for the extracted item
 */
export interface FeedbackContext {
  emailSubject?: string;
  emailFrom?: string;
  emailSnippet?: string;
  emailId?: string;
}

/**
 * Details about the extracted item being rated
 */
export interface ExtractedItem {
  value: string;
  entityType?: string;
  relationshipType?: string;
  source?: string;
  target?: string;
  confidence?: number;
}

/**
 * A single feedback record for ML training
 */
export interface FeedbackRecord {
  id: string;
  timestamp: string;
  type: 'entity' | 'relationship';
  context: FeedbackContext;
  extracted: ExtractedItem;
  feedback: 'positive' | 'negative';
  correction?: string;
}

/**
 * Statistics about collected feedback
 */
export interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  byType: {
    entity: { positive: number; negative: number };
    relationship: { positive: number; negative: number };
  };
  byEntityType: Record<string, { positive: number; negative: number }>;
  byRelationshipType: Record<string, { positive: number; negative: number }>;
}

export class FeedbackService {
  private records: Map<string, FeedbackRecord> = new Map();
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data', 'feedback');
    console.log(`${LOG_PREFIX} Initialized with data directory: ${this.dataDir}`);
  }

  /**
   * Generate a unique feedback ID
   */
  private generateId(): string {
    return `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Record feedback for an entity or relationship
   */
  recordFeedback(
    type: 'entity' | 'relationship',
    extracted: ExtractedItem,
    feedback: 'positive' | 'negative',
    context?: FeedbackContext,
    correction?: string
  ): FeedbackRecord {
    const record: FeedbackRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type,
      context: context || {},
      extracted,
      feedback,
      correction,
    };

    this.records.set(record.id, record);
    console.log(
      `${LOG_PREFIX} Recorded ${feedback} feedback for ${type}: ${extracted.value}`
    );

    return record;
  }

  /**
   * Get a specific feedback record
   */
  getRecord(id: string): FeedbackRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Get all feedback records
   */
  getAllRecords(): FeedbackRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get feedback for a specific extracted value
   */
  getFeedbackForValue(value: string): FeedbackRecord | undefined {
    const records = Array.from(this.records.values());
    for (const record of records) {
      if (record.extracted.value === value) {
        return record;
      }
    }
    return undefined;
  }

  /**
   * Calculate feedback statistics
   */
  getStats(): FeedbackStats {
    const stats: FeedbackStats = {
      total: this.records.size,
      positive: 0,
      negative: 0,
      byType: {
        entity: { positive: 0, negative: 0 },
        relationship: { positive: 0, negative: 0 },
      },
      byEntityType: {},
      byRelationshipType: {},
    };

    const records = Array.from(this.records.values());
    for (const record of records) {
      // Overall counts
      if (record.feedback === 'positive') {
        stats.positive++;
      } else {
        stats.negative++;
      }

      // By type (entity/relationship)
      if (record.feedback === 'positive') {
        stats.byType[record.type].positive++;
      } else {
        stats.byType[record.type].negative++;
      }

      // By entity type
      if (record.type === 'entity' && record.extracted.entityType) {
        const entityType = record.extracted.entityType;
        if (!stats.byEntityType[entityType]) {
          stats.byEntityType[entityType] = { positive: 0, negative: 0 };
        }
        if (record.feedback === 'positive') {
          stats.byEntityType[entityType].positive++;
        } else {
          stats.byEntityType[entityType].negative++;
        }
      }

      // By relationship type
      if (record.type === 'relationship' && record.extracted.relationshipType) {
        const relType = record.extracted.relationshipType;
        if (!stats.byRelationshipType[relType]) {
          stats.byRelationshipType[relType] = { positive: 0, negative: 0 };
        }
        if (record.feedback === 'positive') {
          stats.byRelationshipType[relType].positive++;
        } else {
          stats.byRelationshipType[relType].negative++;
        }
      }
    }

    return stats;
  }

  /**
   * Export all feedback to JSONL format for ML training
   * Each line is a valid JSON object
   */
  exportToJSONL(): string {
    const records = this.getAllRecords();
    return records.map((record) => JSON.stringify(record)).join('\n');
  }

  /**
   * Save feedback to a JSONL file
   */
  async saveToFile(filename?: string): Promise<string> {
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const name = filename || `feedback_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    const filepath = path.join(this.dataDir, name);

    const content = this.exportToJSONL();
    fs.writeFileSync(filepath, content, 'utf-8');

    console.log(`${LOG_PREFIX} Saved ${this.records.size} records to ${filepath}`);
    return filepath;
  }

  /**
   * Load feedback from a JSONL file
   */
  async loadFromFile(filepath: string): Promise<number> {
    if (!fs.existsSync(filepath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    let loaded = 0;
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as FeedbackRecord;
        this.records.set(record.id, record);
        loaded++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to parse line:`, error);
      }
    }

    console.log(`${LOG_PREFIX} Loaded ${loaded} records from ${filepath}`);
    return loaded;
  }

  /**
   * Clear all feedback records
   */
  clear(): void {
    this.records.clear();
    console.log(`${LOG_PREFIX} Cleared all feedback records`);
  }

  /**
   * Delete a specific feedback record
   */
  deleteRecord(id: string): boolean {
    const deleted = this.records.delete(id);
    if (deleted) {
      console.log(`${LOG_PREFIX} Deleted feedback record: ${id}`);
    }
    return deleted;
  }
}

// Singleton instance
let feedbackServiceInstance: FeedbackService | null = null;

export function getFeedbackService(dataDir?: string): FeedbackService {
  if (!feedbackServiceInstance) {
    feedbackServiceInstance = new FeedbackService(dataDir);
  }
  return feedbackServiceInstance;
}
