/**
 * Rate Limiter
 * Implements token bucket algorithm for API rate limiting
 */

import type { RateLimitConfig, RateLimitQuota } from './types';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Rate limiter with configurable limits per time window
 * Uses in-memory token buckets for simplicity
 */
export class RateLimiter {
  private perSecondBucket: RateLimitBucket;
  private perMinuteBucket: RateLimitBucket;
  private perDayBucket: RateLimitBucket;

  private readonly limits: Required<RateLimitConfig>;

  constructor(limits: RateLimitConfig) {
    this.limits = {
      perSecond: limits.perSecond ?? 1,
      perMinute: limits.perMinute ?? 60,
      perDay: limits.perDay ?? 2000,
    };

    // Initialize buckets with full tokens
    const now = Date.now();
    this.perSecondBucket = { tokens: this.limits.perSecond, lastRefill: now };
    this.perMinuteBucket = { tokens: this.limits.perMinute, lastRefill: now };
    this.perDayBucket = { tokens: this.limits.perDay, lastRefill: now };
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillBucket(
    bucket: RateLimitBucket,
    maxTokens: number,
    refillIntervalMs: number
  ): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / refillIntervalMs);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * Check if a request can proceed without blocking
   */
  canProceed(): boolean {
    // Refill all buckets
    this.refillBucket(this.perSecondBucket, this.limits.perSecond, 1000);
    this.refillBucket(this.perMinuteBucket, this.limits.perMinute, 60000);
    this.refillBucket(this.perDayBucket, this.limits.perDay, 86400000);

    // Check all buckets have at least 1 token
    return (
      this.perSecondBucket.tokens >= 1 &&
      this.perMinuteBucket.tokens >= 1 &&
      this.perDayBucket.tokens >= 1
    );
  }

  /**
   * Acquire a token, blocking until available
   * Returns immediately if token is available
   */
  async acquire(): Promise<void> {
    while (!this.canProceed()) {
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Consume tokens from all buckets
    this.perSecondBucket.tokens -= 1;
    this.perMinuteBucket.tokens -= 1;
    this.perDayBucket.tokens -= 1;
  }

  /**
   * Get remaining quota for each time window
   */
  getRemainingQuota(): RateLimitQuota {
    // Refill buckets first
    this.refillBucket(this.perSecondBucket, this.limits.perSecond, 1000);
    this.refillBucket(this.perMinuteBucket, this.limits.perMinute, 60000);
    this.refillBucket(this.perDayBucket, this.limits.perDay, 86400000);

    return {
      second: Math.max(0, this.perSecondBucket.tokens),
      minute: Math.max(0, this.perMinuteBucket.tokens),
      day: Math.max(0, this.perDayBucket.tokens),
    };
  }

  /**
   * Reset all buckets to full capacity
   * Useful for testing
   */
  reset(): void {
    const now = Date.now();
    this.perSecondBucket = { tokens: this.limits.perSecond, lastRefill: now };
    this.perMinuteBucket = { tokens: this.limits.perMinute, lastRefill: now };
    this.perDayBucket = { tokens: this.limits.perDay, lastRefill: now };
  }
}
