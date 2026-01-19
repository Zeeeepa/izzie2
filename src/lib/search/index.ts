/**
 * Unified Web Search Infrastructure
 * Main interface for search and content fetching
 */

import type { SearchOptions, SearchResult, FetchOptions, FetchResult } from './types';
import { getBraveSearchProvider } from './brave';
import { fetchUrl as fetchUrlInternal } from './fetcher';
import { getCachedSource, cacheSource } from './cache';

/**
 * Web search with automatic caching
 * Uses Brave Search API by default
 */
export async function webSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const provider = getBraveSearchProvider();

  if (!provider.isConfigured()) {
    console.warn('[Search] Brave Search API not configured. Set BRAVE_SEARCH_API_KEY.');
    return [];
  }

  try {
    const results = await provider.search(query, options);
    return results;
  } catch (error) {
    console.error('[Search] Search failed:', error);
    throw error;
  }
}

/**
 * Fetch URL content and cache to database
 * Checks cache first, then fetches if needed
 */
export async function fetchAndCache(
  taskId: string,
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  // Check cache first
  const cached = await getCachedSource(url, taskId);

  if (cached && cached.fetchStatus === 'fetched' && cached.content) {
    console.log(`[Search] Using cached content for: ${url}`);

    return {
      url: cached.url,
      title: cached.title || undefined,
      content: cached.content,
      contentType: cached.contentType || 'html',
      fetchedAt: cached.fetchedAt || cached.createdAt,
    };
  }

  // Fetch fresh content
  console.log(`[Search] Fetching fresh content for: ${url}`);
  const result = await fetchUrlInternal(url, options);

  // Cache the result
  try {
    await cacheSource({
      taskId,
      url: result.url,
      title: result.title,
      content: result.content,
      contentType: result.contentType,
      fetchStatus: result.error ? 'failed' : 'fetched',
      fetchError: result.error,
      fetchedAt: result.fetchedAt,
    });
  } catch (error) {
    console.error('[Search] Failed to cache result:', error);
    // Continue even if caching fails
  }

  return result;
}

/**
 * Batch fetch multiple URLs with caching
 * Processes in parallel with concurrency limit
 */
export async function batchFetchAndCache(
  taskId: string,
  urls: string[],
  options: FetchOptions & { concurrency?: number } = {}
): Promise<FetchResult[]> {
  const concurrency = options.concurrency || 5;
  const results: FetchResult[] = [];

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    console.log(
      `[Search] Fetching batch ${i / concurrency + 1}/${Math.ceil(urls.length / concurrency)} (${batch.length} URLs)`
    );

    const batchResults = await Promise.all(
      batch.map((url) => fetchAndCache(taskId, url, options))
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Search and fetch top results
 * Combines search and fetch into one operation
 */
export async function searchAndFetch(
  taskId: string,
  query: string,
  searchOptions: SearchOptions = {},
  fetchOptions: FetchOptions = {}
): Promise<Array<SearchResult & { fetchResult?: FetchResult }>> {
  // Search
  const searchResults = await webSearch(query, searchOptions);

  if (searchResults.length === 0) {
    return [];
  }

  // Fetch content for each result
  const urls = searchResults.map((r) => r.url);
  const fetchResults = await batchFetchAndCache(taskId, urls, fetchOptions);

  // Combine results
  const combined = searchResults.map((searchResult, i) => ({
    ...searchResult,
    fetchResult: fetchResults[i],
  }));

  return combined;
}

// Re-export types and utilities
export * from './types';
export * from './brave';
export * from './fetcher';
export * from './cache';
export * from './rate-limiter';
