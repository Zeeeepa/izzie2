/**
 * Retrieval Cache
 *
 * Simple in-memory LRU cache for frequently accessed queries.
 * Reduces latency for repeated searches.
 */

import type { CacheEntry, RetrievalResult } from './types';

/**
 * LRU Cache for retrieval results
 */
export class RetrievalCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttl: number; // Time-to-live in seconds

  constructor(maxSize: number = 100, ttl: number = 300) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Generate cache key from query and userId
   */
  private getCacheKey(query: string, userId: string): string {
    return `${userId}:${query.toLowerCase().trim()}`;
  }

  /**
   * Get cached result if available and not expired
   */
  get(query: string, userId: string): RetrievalResult | null {
    const key = this.getCacheKey(query, userId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000;

    if (age > this.ttl) {
      // Expired - remove from cache
      this.cache.delete(key);
      return null;
    }

    // Update hit count and move to end (LRU)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    console.log(
      `[RetrievalCache] Cache hit for query: "${query}" (${entry.hits} hits, age: ${Math.round(age)}s)`
    );

    return entry.result;
  }

  /**
   * Set cache entry
   */
  set(query: string, userId: string, result: RetrievalResult): void {
    const key = this.getCacheKey(query, userId);

    // Check if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest entry (first in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // Add new entry
    const entry: CacheEntry = {
      query,
      userId,
      result,
      timestamp: Date.now(),
      hits: 0,
    };

    this.cache.set(key, entry);

    console.log(
      `[RetrievalCache] Cached result for query: "${query}" (${this.cache.size}/${this.maxSize})`
    );
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    console.log('[RetrievalCache] Cache cleared');
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000;
      if (age > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[RetrievalCache] Removed ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttl: number;
    entries: Array<{
      query: string;
      userId: string;
      hits: number;
      age: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values()).map((entry) => ({
      query: entry.query,
      userId: entry.userId,
      hits: entry.hits,
      age: Math.round((now - entry.timestamp) / 1000),
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      entries,
    };
  }
}

// Export singleton instance
export const retrievalCache = new RetrievalCache();
