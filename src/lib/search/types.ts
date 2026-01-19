/**
 * Web Search Infrastructure Types
 * Types for search providers, content fetching, and caching
 */

/**
 * Search provider interface
 * All search providers must implement this interface
 */
export interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Search options
 */
export interface SearchOptions {
  maxResults?: number; // default 10
  freshness?: 'day' | 'week' | 'month' | 'year';
  country?: string;
  language?: string;
}

/**
 * Search result from provider
 */
export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
}

/**
 * Content fetcher types
 */
export interface FetchResult {
  url: string;
  title?: string;
  content: string;
  contentType: string; // html, pdf, text
  fetchedAt: Date;
  error?: string;
}

/**
 * Fetch options
 */
export interface FetchOptions {
  timeout?: number; // ms, default 30000
  maxSize?: number; // bytes, default 5MB
  userAgent?: string;
  followRedirects?: boolean;
}

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  perSecond?: number;
  perMinute?: number;
  perDay?: number;
}

/**
 * Rate limiter quota
 */
export interface RateLimitQuota {
  second: number;
  minute: number;
  day: number;
}
