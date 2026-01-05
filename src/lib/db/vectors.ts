/**
 * Vector Operations Service
 *
 * Provides high-level functions for working with vector embeddings in Neon Postgres.
 * Supports semantic search, CRUD operations, and relevance scoring.
 *
 * Uses pgvector extension with cosine similarity for semantic search.
 */

import { eq, desc, sql, and, isNull, gte } from 'drizzle-orm';
import { dbClient } from './client';
import { memoryEntries, type NewMemoryEntry, type MemoryEntry } from './schema';

/**
 * Search result with similarity score
 */
export interface VectorSearchResult extends MemoryEntry {
  similarity: number;
}

/**
 * Vector operations class
 */
export class VectorOperations {
  /**
   * Insert a new memory entry with vector embedding
   */
  async insertVector(data: {
    userId: string;
    content: string;
    embedding: number[];
    conversationId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    importance?: number;
  }): Promise<MemoryEntry> {
    const db = dbClient.getDb();

    // Convert number array to pgvector format
    const embeddingStr = `[${data.embedding.join(',').toString()}]`;

    try {
      const [entry] = await db
        .insert(memoryEntries)
        .values({
          userId: data.userId,
          conversationId: data.conversationId,
          content: data.content,
          summary: data.summary,
          metadata: data.metadata,
          importance: data.importance || 5,
          embedding: sql.raw(`'${embeddingStr}'::vector`),
        })
        .returning();

      console.log('[VectorOps] Inserted memory entry:', entry.id);
      return entry;
    } catch (error) {
      console.error('[VectorOps] Insert error:', error);
      throw error;
    }
  }

  /**
   * Search for similar vectors using cosine similarity
   *
   * @param embedding - Query vector (1536 dimensions)
   * @param options - Search options
   * @returns Array of results sorted by similarity (highest first)
   */
  async searchSimilar(
    embedding: number[],
    options: {
      userId?: string;
      conversationId?: string;
      limit?: number;
      threshold?: number; // Minimum similarity score (0-1)
      minImportance?: number;
      excludeDeleted?: boolean;
    } = {}
  ): Promise<VectorSearchResult[]> {
    const {
      userId,
      conversationId,
      limit = 10,
      threshold = 0.7,
      minImportance = 1,
      excludeDeleted = true,
    } = options;

    const db = dbClient.getDb();

    // Convert number array to pgvector format
    const embeddingStr = `[${embedding.join(',').toString()}]`;

    try {
      // Build WHERE conditions
      const conditions = [];

      if (userId) {
        conditions.push(eq(memoryEntries.userId, userId));
      }

      if (conversationId) {
        conditions.push(eq(memoryEntries.conversationId, conversationId));
      }

      if (excludeDeleted) {
        conditions.push(eq(memoryEntries.isDeleted, false));
      }

      if (minImportance > 1) {
        conditions.push(gte(memoryEntries.importance, minImportance));
      }

      // Execute similarity search using cosine distance
      // Note: 1 - cosine_distance = cosine_similarity
      const results = await db
        .select({
          id: memoryEntries.id,
          conversationId: memoryEntries.conversationId,
          userId: memoryEntries.userId,
          content: memoryEntries.content,
          summary: memoryEntries.summary,
          metadata: memoryEntries.metadata,
          embedding: memoryEntries.embedding,
          importance: memoryEntries.importance,
          accessCount: memoryEntries.accessCount,
          lastAccessedAt: memoryEntries.lastAccessedAt,
          isDeleted: memoryEntries.isDeleted,
          createdAt: memoryEntries.createdAt,
          updatedAt: memoryEntries.updatedAt,
          similarity: sql<number>`1 - (${memoryEntries.embedding} <=> ${sql.raw(`'${embeddingStr}'::vector`)})`,
        })
        .from(memoryEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          desc(
            sql`1 - (${memoryEntries.embedding} <=> ${sql.raw(`'${embeddingStr}'::vector`)})`
          )
        )
        .limit(limit);

      // Filter by similarity threshold
      const filtered = results.filter((r) => r.similarity >= threshold);

      console.log(
        `[VectorOps] Found ${filtered.length} similar entries (threshold: ${threshold})`
      );

      return filtered;
    } catch (error) {
      console.error('[VectorOps] Search error:', error);
      throw error;
    }
  }

  /**
   * Update a memory entry's vector
   */
  async updateVector(
    id: string,
    data: {
      content?: string;
      embedding?: number[];
      summary?: string;
      metadata?: Record<string, unknown>;
      importance?: number;
    }
  ): Promise<MemoryEntry> {
    const db = dbClient.getDb();

    try {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.content !== undefined) {
        updates.content = data.content;
      }

      if (data.summary !== undefined) {
        updates.summary = data.summary;
      }

      if (data.metadata !== undefined) {
        updates.metadata = data.metadata;
      }

      if (data.importance !== undefined) {
        updates.importance = data.importance;
      }

      if (data.embedding !== undefined) {
        const embeddingStr = `[${data.embedding.join(',').toString()}]`;
        updates.embedding = sql.raw(`'${embeddingStr}'::vector`);
      }

      const [updated] = await db
        .update(memoryEntries)
        .set(updates)
        .where(eq(memoryEntries.id, id))
        .returning();

      console.log('[VectorOps] Updated memory entry:', id);
      return updated;
    } catch (error) {
      console.error('[VectorOps] Update error:', error);
      throw error;
    }
  }

  /**
   * Soft delete a memory entry
   */
  async deleteVector(id: string, hard: boolean = false): Promise<void> {
    const db = dbClient.getDb();

    try {
      if (hard) {
        // Hard delete - permanently remove
        await db.delete(memoryEntries).where(eq(memoryEntries.id, id));
        console.log('[VectorOps] Hard deleted memory entry:', id);
      } else {
        // Soft delete - mark as deleted
        await db
          .update(memoryEntries)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(memoryEntries.id, id));
        console.log('[VectorOps] Soft deleted memory entry:', id);
      }
    } catch (error) {
      console.error('[VectorOps] Delete error:', error);
      throw error;
    }
  }

  /**
   * Get a memory entry by ID and update access tracking
   */
  async getById(id: string, trackAccess: boolean = true): Promise<MemoryEntry | null> {
    const db = dbClient.getDb();

    try {
      const [entry] = await db
        .select()
        .from(memoryEntries)
        .where(and(eq(memoryEntries.id, id), eq(memoryEntries.isDeleted, false)))
        .limit(1);

      if (!entry) {
        return null;
      }

      // Update access tracking
      if (trackAccess) {
        await db
          .update(memoryEntries)
          .set({
            accessCount: sql`${memoryEntries.accessCount} + 1`,
            lastAccessedAt: new Date(),
          })
          .where(eq(memoryEntries.id, id));
      }

      return entry;
    } catch (error) {
      console.error('[VectorOps] Get by ID error:', error);
      throw error;
    }
  }

  /**
   * Get recent memories for a user
   */
  async getRecent(
    userId: string,
    options: {
      limit?: number;
      conversationId?: string;
      excludeDeleted?: boolean;
    } = {}
  ): Promise<MemoryEntry[]> {
    const { limit = 20, conversationId, excludeDeleted = true } = options;

    const db = dbClient.getDb();

    try {
      const conditions = [eq(memoryEntries.userId, userId)];

      if (conversationId) {
        conditions.push(eq(memoryEntries.conversationId, conversationId));
      }

      if (excludeDeleted) {
        conditions.push(eq(memoryEntries.isDeleted, false));
      }

      const entries = await db
        .select()
        .from(memoryEntries)
        .where(and(...conditions))
        .orderBy(desc(memoryEntries.createdAt))
        .limit(limit);

      return entries;
    } catch (error) {
      console.error('[VectorOps] Get recent error:', error);
      throw error;
    }
  }

  /**
   * Get memory statistics for a user
   */
  async getStats(
    userId: string
  ): Promise<{
    total: number;
    byConversation: Record<string, number>;
    avgImportance: number;
    totalAccesses: number;
  }> {
    const db = dbClient.getDb();

    try {
      // Get total count
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(memoryEntries)
        .where(
          and(eq(memoryEntries.userId, userId), eq(memoryEntries.isDeleted, false))
        );

      // Get stats by conversation
      const conversationStats = await db
        .select({
          conversationId: memoryEntries.conversationId,
          count: sql<number>`count(*)`,
        })
        .from(memoryEntries)
        .where(
          and(
            eq(memoryEntries.userId, userId),
            eq(memoryEntries.isDeleted, false),
            isNull(memoryEntries.conversationId)
          )
        )
        .groupBy(memoryEntries.conversationId);

      // Get average importance and total accesses
      const [statsResult] = await db
        .select({
          avgImportance: sql<number>`avg(${memoryEntries.importance})`,
          totalAccesses: sql<number>`sum(${memoryEntries.accessCount})`,
        })
        .from(memoryEntries)
        .where(
          and(eq(memoryEntries.userId, userId), eq(memoryEntries.isDeleted, false))
        );

      return {
        total: Number(totalResult.count),
        byConversation: Object.fromEntries(
          conversationStats.map((s) => [s.conversationId || 'null', Number(s.count)])
        ),
        avgImportance: Number(statsResult.avgImportance) || 0,
        totalAccesses: Number(statsResult.totalAccesses) || 0,
      };
    } catch (error) {
      console.error('[VectorOps] Get stats error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const vectorOps = new VectorOperations();
