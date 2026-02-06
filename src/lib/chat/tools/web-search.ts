/**
 * Web Search Tool
 * Enables LLM to search the web for current information
 */

import { z } from 'zod';
import { getBraveSearchProvider } from '@/lib/search/brave';

/**
 * Web search tool parameters
 */
export const webSearchParameters = z.object({
  query: z.string().describe('The search query - be specific and include location if relevant'),
  maxResults: z.number().int().min(1).max(10).optional().default(5),
});

/**
 * Web search tool definition
 */
export const webSearchTool = {
  name: 'web_search',
  description:
    'Search the web for current information. Use for finding businesses, local services, news, facts, reviews, prices, or any question needing up-to-date information. Returns search results with titles, descriptions, and URLs.',
  parameters: webSearchParameters,

  /**
   * Execute web search
   */
  async execute(
    params: z.infer<typeof webSearchParameters>,
    userId: string
  ): Promise<{ results: Array<{ title: string; description: string; url: string }>; error?: string }> {
    console.log(`[WebSearchTool] User ${userId} searching: "${params.query}"`);

    try {
      const provider = getBraveSearchProvider();

      if (!provider.isConfigured()) {
        return {
          results: [],
          error: 'Web search is not configured. BRAVE_SEARCH_API_KEY is missing.',
        };
      }

      const searchResults = await provider.search(params.query, {
        maxResults: params.maxResults || 5,
      });

      const results = searchResults.map((r) => ({
        title: r.title,
        description: r.snippet,
        url: r.url,
      }));

      console.log(`[WebSearchTool] Found ${results.length} results`);

      return { results };
    } catch (error) {
      console.error('[WebSearchTool] Search failed:', error);
      return {
        results: [],
        error: error instanceof Error ? error.message : 'Web search failed',
      };
    }
  },
};
