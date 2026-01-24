/**
 * Unified Knowledge Retrieval
 *
 * Merges knowledge from all three tiers:
 * 1. Global/Core - System-wide knowledge (capabilities, docs, changelogs)
 * 2. Organization - Org-specific knowledge (shared within a team/company)
 * 3. Personal - User-specific knowledge (memories, entities from Weaviate)
 *
 * This is the main entry point for retrieving contextual knowledge in chat.
 */

import { eq } from 'drizzle-orm';
import { dbClient } from '../db';
import { organizationMembers, organizations, type Organization } from '../db/schema';
import { getGlobalKnowledge, getOrganizationKnowledge, searchSharedKnowledge } from './shared-knowledge';
import { searchMemories } from '../memory/retrieval';
import type { KnowledgeResult, KnowledgeRetrievalOptions, SharedKnowledgeType } from './types';
import { DEFAULT_RETRIEVAL_OPTIONS } from './types';

const LOG_PREFIX = '[KnowledgeRetrieval]';

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Fetching organizations for user ${userId}`);

  const results = await db
    .select({
      organization: organizations,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId));

  const orgs = results.map((r) => r.organization);
  console.log(`${LOG_PREFIX} User belongs to ${orgs.length} organization(s)`);
  return orgs;
}

/**
 * Retrieve knowledge from all tiers and merge results
 *
 * Priority order for deduplication:
 * 1. Personal (most specific)
 * 2. Organization (team-specific)
 * 3. Global (system-wide)
 *
 * @param userId - User ID for personal knowledge and org membership lookup
 * @param query - Search query for relevance matching
 * @param options - Retrieval options (which tiers to include, limits, etc.)
 */
export async function retrieveKnowledge(
  userId: string,
  query: string,
  options?: KnowledgeRetrievalOptions
): Promise<KnowledgeResult[]> {
  const opts = { ...DEFAULT_RETRIEVAL_OPTIONS, ...options };
  const results: KnowledgeResult[] = [];

  console.log(`${LOG_PREFIX} Retrieving knowledge for user ${userId}, query: "${query}"`);
  console.log(`${LOG_PREFIX} Options: global=${opts.includeGlobal}, org=${opts.includeOrganization}, personal=${opts.includePersonal}`);

  // Fetch from all tiers in parallel
  const promises: Promise<void>[] = [];

  // 1. Global knowledge (always from PostgreSQL shared_knowledge)
  if (opts.includeGlobal) {
    promises.push(
      fetchGlobalKnowledge(query, opts.type).then((items) => {
        results.push(...items);
      })
    );
  }

  // 2. Organization knowledge
  if (opts.includeOrganization) {
    promises.push(
      fetchOrganizationKnowledge(userId, query, opts.type).then((items) => {
        results.push(...items);
      })
    );
  }

  // 3. Personal knowledge (from Weaviate memories)
  if (opts.includePersonal) {
    promises.push(
      fetchPersonalKnowledge(userId, query).then((items) => {
        results.push(...items);
      })
    );
  }

  await Promise.all(promises);

  console.log(`${LOG_PREFIX} Retrieved ${results.length} total knowledge items before deduplication`);

  // Deduplicate and rank by relevance
  const deduplicated = deduplicateKnowledge(results);

  // Filter by minimum relevance if specified
  let filtered = deduplicated;
  if (opts.minRelevance !== undefined) {
    filtered = deduplicated.filter(
      (k) => k.relevanceScore === undefined || k.relevanceScore >= opts.minRelevance!
    );
  }

  // Apply limit
  const limited = filtered.slice(0, opts.limit);

  console.log(`${LOG_PREFIX} Returning ${limited.length} knowledge items`);
  return limited;
}

/**
 * Fetch global knowledge matching query
 */
async function fetchGlobalKnowledge(
  query: string,
  type?: SharedKnowledgeType
): Promise<KnowledgeResult[]> {
  try {
    const items = await searchSharedKnowledge(query, {
      organizationId: null, // Global only
      type,
      limit: 20,
    });

    return items.map((item) => ({
      id: item.id,
      content: item.content,
      type: item.type,
      title: item.title,
      source: 'global' as const,
      // Simple relevance based on title match
      relevanceScore: calculateTextRelevance(query, item.title, item.content),
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching global knowledge:`, error);
    return [];
  }
}

/**
 * Fetch organization knowledge for all orgs user belongs to
 */
async function fetchOrganizationKnowledge(
  userId: string,
  query: string,
  type?: SharedKnowledgeType
): Promise<KnowledgeResult[]> {
  try {
    // Get user's organizations
    const userOrgs = await getUserOrganizations(userId);

    if (userOrgs.length === 0) {
      return [];
    }

    // Fetch knowledge from each org in parallel
    const orgResults = await Promise.all(
      userOrgs.map(async (org) => {
        const items = await searchSharedKnowledge(query, {
          organizationId: org.id,
          type,
          limit: 20,
        });

        return items.map((item) => ({
          id: item.id,
          content: item.content,
          type: item.type,
          title: item.title,
          source: 'organization' as const,
          organizationId: org.id,
          organizationName: org.name,
          relevanceScore: calculateTextRelevance(query, item.title, item.content),
        }));
      })
    );

    return orgResults.flat();
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching organization knowledge:`, error);
    return [];
  }
}

/**
 * Fetch personal knowledge from Weaviate memories
 */
async function fetchPersonalKnowledge(userId: string, query: string): Promise<KnowledgeResult[]> {
  try {
    const memories = await searchMemories({
      query,
      userId,
      limit: 20,
      minStrength: 0.3,
    });

    return memories.map((memory) => ({
      id: memory.id,
      content: memory.content,
      type: memory.category,
      source: 'personal' as const,
      // Use memory strength as relevance score
      relevanceScore: memory.strength,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching personal knowledge:`, error);
    return [];
  }
}

/**
 * Calculate simple text relevance score (0-1)
 * Uses basic keyword matching
 */
function calculateTextRelevance(query: string, title: string, content: string): number {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  if (queryWords.length === 0) return 0.5;

  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  let matches = 0;
  let titleMatches = 0;

  for (const word of queryWords) {
    if (titleLower.includes(word)) {
      titleMatches++;
      matches++;
    }
    if (contentLower.includes(word)) {
      matches++;
    }
  }

  // Title matches are worth more
  const maxScore = queryWords.length * 2; // 1 for content, 1 for title
  const score = (matches + titleMatches) / maxScore;

  return Math.min(1, score);
}

/**
 * Deduplicate knowledge items by content similarity
 * Prioritizes: personal > organization > global
 */
function deduplicateKnowledge(items: KnowledgeResult[]): KnowledgeResult[] {
  const seen = new Map<string, KnowledgeResult>();
  const SOURCE_PRIORITY: Record<string, number> = {
    personal: 3,
    organization: 2,
    global: 1,
  };

  // Sort by source priority (highest first) and relevance
  const sorted = [...items].sort((a, b) => {
    const priorityDiff = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });

  for (const item of sorted) {
    // Create a normalized key from content (first 100 chars)
    const contentKey = item.content.substring(0, 100).toLowerCase().trim();

    if (!seen.has(contentKey)) {
      seen.set(contentKey, item);
    }
    // Skip duplicates (higher priority item already added)
  }

  // Return sorted by relevance score
  return Array.from(seen.values()).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}

/**
 * Retrieve knowledge without a specific query (browse mode)
 * Returns recent/important knowledge from each tier
 */
export async function browseKnowledge(
  userId: string,
  options?: Pick<KnowledgeRetrievalOptions, 'includeGlobal' | 'includeOrganization' | 'includePersonal' | 'type' | 'limit'>
): Promise<KnowledgeResult[]> {
  const opts = { ...DEFAULT_RETRIEVAL_OPTIONS, ...options };
  const results: KnowledgeResult[] = [];

  console.log(`${LOG_PREFIX} Browsing knowledge for user ${userId}`);

  const promises: Promise<void>[] = [];

  // 1. Global knowledge
  if (opts.includeGlobal) {
    promises.push(
      getGlobalKnowledge(opts.type).then((items) => {
        results.push(
          ...items.map((item) => ({
            id: item.id,
            content: item.content,
            type: item.type,
            title: item.title,
            source: 'global' as const,
          }))
        );
      })
    );
  }

  // 2. Organization knowledge
  if (opts.includeOrganization) {
    promises.push(
      getUserOrganizations(userId).then(async (orgs) => {
        for (const org of orgs) {
          const items = await getOrganizationKnowledge(org.id, opts.type);
          results.push(
            ...items.map((item) => ({
              id: item.id,
              content: item.content,
              type: item.type,
              title: item.title,
              source: 'organization' as const,
              organizationId: org.id,
              organizationName: org.name,
            }))
          );
        }
      })
    );
  }

  // 3. Personal knowledge (recent memories)
  if (opts.includePersonal) {
    // Import dynamically to avoid circular deps
    const { getRecentMemories } = await import('../memory/retrieval');
    promises.push(
      getRecentMemories(userId, { limit: 20 }).then((memories) => {
        results.push(
          ...memories.map((memory) => ({
            id: memory.id,
            content: memory.content,
            type: memory.category,
            source: 'personal' as const,
          }))
        );
      })
    );
  }

  await Promise.all(promises);

  // Apply limit
  return results.slice(0, opts.limit);
}
