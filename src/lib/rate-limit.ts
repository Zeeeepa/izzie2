/**
 * Rate Limiting with Upstash Redis
 *
 * Provides sliding window rate limiting for API routes.
 * - Authenticated users: 100 requests per minute
 * - Anonymous users: 20 requests per minute
 *
 * Falls back to allowing all requests if Upstash env vars are not configured.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const LOG_PREFIX = '[RateLimit]';

// Rate limit configurations
const AUTHENTICATED_LIMIT = 100; // requests per minute
const ANONYMOUS_LIMIT = 20; // requests per minute
const WINDOW_DURATION = '1 m'; // 1 minute sliding window

// Lazy-initialize Redis and rate limiters
let redis: Redis | null = null;
let authenticatedLimiter: Ratelimit | null = null;
let anonymousLimiter: Ratelimit | null = null;

/**
 * Check if Upstash is configured
 */
function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Initialize Redis client and rate limiters
 */
function initializeRateLimiters(): void {
  if (!isUpstashConfigured()) {
    console.warn(`${LOG_PREFIX} Upstash Redis not configured - rate limiting disabled`);
    return;
  }

  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // Rate limiter for authenticated users (100 req/min)
    authenticatedLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(AUTHENTICATED_LIMIT, WINDOW_DURATION),
      analytics: true,
      prefix: 'ratelimit:auth',
    });

    // Rate limiter for anonymous users (20 req/min)
    anonymousLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ANONYMOUS_LIMIT, WINDOW_DURATION),
      analytics: true,
      prefix: 'ratelimit:anon',
    });

    console.log(`${LOG_PREFIX} Rate limiting initialized`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize rate limiters:`, error);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset?: number; // Unix timestamp when the rate limit resets
  limit?: number;
}

/**
 * Check rate limit for an identifier
 *
 * @param identifier - Unique identifier (user ID for authenticated, IP for anonymous)
 * @param isAuthenticated - Whether the request is from an authenticated user
 * @returns Rate limit result with success status and remaining requests
 */
export async function rateLimit(
  identifier: string,
  isAuthenticated: boolean = true
): Promise<RateLimitResult> {
  // If Upstash not configured, allow all requests (for local dev)
  if (!isUpstashConfigured()) {
    return {
      success: true,
      remaining: isAuthenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT,
      limit: isAuthenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT,
    };
  }

  // Initialize on first use
  if (!authenticatedLimiter || !anonymousLimiter) {
    initializeRateLimiters();
  }

  // Still not initialized (initialization failed)
  if (!authenticatedLimiter || !anonymousLimiter) {
    console.warn(`${LOG_PREFIX} Rate limiters not available - allowing request`);
    return {
      success: true,
      remaining: isAuthenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT,
      limit: isAuthenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT,
    };
  }

  try {
    const limiter = isAuthenticated ? authenticatedLimiter : anonymousLimiter;
    const result = await limiter.limit(identifier);

    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Rate limit check failed:`, error);
    // Fail open - allow request if rate limiting fails
    return {
      success: true,
      remaining: isAuthenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT,
      limit: isAuthenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT,
    };
  }
}

/**
 * Get client IP from request headers
 * Handles various proxy headers (x-forwarded-for, x-real-ip, etc.)
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one (client)
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Cloudflare
  const cfConnectingIP = headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Vercel
  const vercelIP = headers.get('x-vercel-forwarded-for');
  if (vercelIP) {
    return vercelIP.split(',')[0].trim();
  }

  // Default fallback
  return 'unknown';
}

/**
 * Calculate Retry-After header value in seconds
 */
export function getRetryAfterSeconds(resetTimestamp: number): number {
  const now = Date.now();
  const retryAfterMs = resetTimestamp - now;
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}
