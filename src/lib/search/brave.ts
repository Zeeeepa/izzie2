/**
 * Brave Search API Provider
 * Implements Brave Search API with rate limiting
 * API Docs: https://api.search.brave.com/app/documentation
 */

import type { SearchProvider, SearchOptions, SearchResult } from './types';
import { RateLimiter } from './rate-limiter';

const BRAVE_API_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

// Rate limits for free tier: 1 req/sec, 2000/month (approx 66/day)
const DEFAULT_RATE_LIMIT = {
  perSecond: Number(process.env.SEARCH_RATE_LIMIT_PER_SECOND) || 1,
  perMinute: 60,
  perDay: Number(process.env.SEARCH_RATE_LIMIT_PER_DAY) || 2000,
};

/**
 * Brave Search response types
 */
interface BraveSearchResponse {
  web?: {
    results?: Array<{
      url: string;
      title: string;
      description: string;
      published_date?: string;
      page_fetched?: string;
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Brave Search API provider implementation
 */
export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  private apiKey: string;
  private rateLimiter: RateLimiter;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.BRAVE_SEARCH_API_KEY || '';

    if (!this.apiKey) {
      console.warn(
        '[BraveSearch] No API key provided. Set BRAVE_SEARCH_API_KEY environment variable.'
      );
    }

    this.rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT);
  }

  /**
   * Search using Brave Search API
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error('Brave Search API key not configured');
    }

    // Wait for rate limiter
    await this.rateLimiter.acquire();

    const maxResults = options.maxResults || 10;

    // Build query parameters
    const params = new URLSearchParams({
      q: query,
      count: maxResults.toString(),
    });

    if (options.freshness) {
      params.append('freshness', options.freshness);
    }

    if (options.country) {
      params.append('country', options.country);
    }

    if (options.language) {
      params.append('search_lang', options.language);
    }

    const url = `${BRAVE_API_ENDPOINT}?${params.toString()}`;

    console.log(`[BraveSearch] Searching: ${query} (max ${maxResults} results)`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brave Search API error (${response.status}): ${errorText}`);
      }

      const data: BraveSearchResponse = await response.json();

      // Check for API error response
      if (data.error) {
        throw new Error(`Brave Search API error: ${data.error.message}`);
      }

      // Extract and map results
      const results = data.web?.results || [];

      const searchResults: SearchResult[] = results.map((result) => ({
        url: result.url,
        title: result.title,
        snippet: result.description,
        publishedDate: result.published_date || result.page_fetched,
        source: 'brave',
      }));

      console.log(`[BraveSearch] Found ${searchResults.length} results`);

      return searchResults;
    } catch (error) {
      console.error('[BraveSearch] Search failed:', error);
      throw error;
    }
  }

  /**
   * Get remaining rate limit quota
   */
  getRemainingQuota() {
    return this.rateLimiter.getRemainingQuota();
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }
}

/**
 * Singleton instance
 */
let braveSearchInstance: BraveSearchProvider | null = null;

/**
 * Get or create Brave Search provider instance
 */
export function getBraveSearchProvider(apiKey?: string): BraveSearchProvider {
  if (!braveSearchInstance) {
    braveSearchInstance = new BraveSearchProvider(apiKey);
  }
  return braveSearchInstance;
}

/**
 * Default export
 */
export default BraveSearchProvider;
