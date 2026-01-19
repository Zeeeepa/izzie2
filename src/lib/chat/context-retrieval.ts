/**
 * Chat Context Retrieval
 *
 * Retrieves relevant entities and memories for chat personalization.
 * Combines entity search with memory retrieval for comprehensive context.
 */

import type { Entity, EntityType } from '../extraction/types';
import type { MemoryWithStrength, MemoryCategory } from '../memory/types';
import type { CalendarEvent } from '../calendar/types';
import { searchEntities } from '../weaviate/entities';
import { searchMemories } from '../memory/retrieval';
import { listEvents } from '../calendar';
import { dbClient } from '../db';
import { memoryEntries } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

// Chat message type
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}


const LOG_PREFIX = '[ChatContext]';

/**
 * Task representation for chat context
 */
export interface PendingTask {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  listTitle: string;
  status: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Unified chat context
 */
export interface ChatContext {
  entities: Entity[];
  memories: MemoryWithStrength[];
  upcomingEvents: CalendarEvent[];
  pendingTasks: PendingTask[];
  recentConversation?: ChatMessage[];
}

/**
 * Options for context retrieval
 */
export interface ContextRetrievalOptions {
  maxEntities?: number;
  maxMemories?: number;
  minMemoryStrength?: number;
  entityTypes?: EntityType[];
  memoryCategories?: MemoryCategory[];
  includeRecentMessages?: boolean;
}

const DEFAULT_OPTIONS: Required<ContextRetrievalOptions> = {
  maxEntities: 10,
  maxMemories: 10,
  minMemoryStrength: 0.3,
  entityTypes: [],
  memoryCategories: [],
  includeRecentMessages: false,
};

/**
 * Retrieve pending tasks from memory entries
 */
async function retrievePendingTasks(userId: string, limit: number = 10): Promise<PendingTask[]> {
  try {
    const db = dbClient.getDb();

    // Query memory entries with source='task_extraction' and status='needsAction'
    const results = await db
      .select({
        id: memoryEntries.id,
        metadata: memoryEntries.metadata,
        createdAt: memoryEntries.createdAt,
        importance: memoryEntries.importance,
      })
      .from(memoryEntries)
      .where(
        and(
          eq(memoryEntries.userId, userId),
          eq(memoryEntries.isDeleted, false),
          sql`${memoryEntries.metadata}->>'source' = 'task_extraction'`,
          sql`${memoryEntries.metadata}->>'status' = 'needsAction'`
        )
      )
      .orderBy(sql`${memoryEntries.importance} DESC`, sql`${memoryEntries.createdAt} DESC`)
      .limit(limit);

    // Map to PendingTask format
    const tasks: PendingTask[] = results
      .map((row) => {
        const metadata = row.metadata as Record<string, unknown>;
        return {
          id: metadata.taskId as string,
          title: metadata.title as string,
          notes: metadata.notes as string | undefined,
          due: metadata.due as string | undefined,
          listTitle: metadata.listTitle as string,
          status: metadata.status as string,
          priority: determinePriority(metadata.due as string | undefined, row.importance),
        };
      })
      .filter((task) => task.id && task.title); // Filter out invalid tasks

    console.log(`${LOG_PREFIX} Retrieved ${tasks.length} pending tasks`);
    return tasks;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error retrieving pending tasks:`, error);
    return [];
  }
}

/**
 * Determine task priority based on due date and importance
 */
function determinePriority(
  due: string | undefined,
  importance: number | null
): 'low' | 'medium' | 'high' {
  // High priority if overdue or due soon
  if (due) {
    const dueDate = new Date(due);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Overdue or due within 3 days
    if (daysUntilDue < 3) {
      return 'high';
    }

    // Due within 7 days
    if (daysUntilDue <= 7) {
      return 'medium';
    }
  }

  // Use importance score if available
  if (importance !== null && importance >= 7) {
    return 'high';
  } else if (importance !== null && importance >= 5) {
    return 'medium';
  }

  return 'low';
}

/**
 * Extract query terms from user message
 *
 * Simple implementation that:
 * - Removes common stop words
 * - Extracts potential named entities (capitalized words)
 * - Preserves multi-word phrases
 */
export function extractQueryTerms(message: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'was',
    'are',
    'been',
    'be',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'can',
    'may',
    'might',
    'must',
    'what',
    'when',
    'where',
    'who',
    'which',
    'how',
    'why',
  ]);

  // Extract words and filter
  const words = message
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => {
      // Remove punctuation
      const cleaned = word.replace(/[^\w]/g, '');
      return cleaned.length > 2 && !stopWords.has(cleaned);
    });

  // Look for capitalized words (potential entities) in original message
  const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const entities = message.match(capitalizedPattern) || [];

  // Combine and deduplicate
  const wordSet = new Set([...words, ...entities.map((e) => e.toLowerCase())]);
  const allTerms = Array.from(wordSet);

  console.log(`${LOG_PREFIX} Extracted query terms from "${message}":`, allTerms);

  return allTerms;
}

/**
 * Retrieve relevant context for a chat message
 *
 * Retrieves both entities and memories in parallel for efficiency.
 */
export async function retrieveContext(
  userId: string,
  message: string,
  recentMessages?: ChatMessage[],
  options?: ContextRetrievalOptions
): Promise<ChatContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log(`${LOG_PREFIX} Retrieving context for user ${userId}...`);

  // Extract query terms for better search
  const queryTerms = extractQueryTerms(message);
  const searchQuery = queryTerms.join(' ') || message;

  // Fetch upcoming calendar events (next 7 days)
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    // Retrieve entities, query-matched memories, high-importance preferences, calendar events, and pending tasks in parallel
    const [entities, memories, preferenceMemories, calendarResult, pendingTasks] =
      await Promise.all([
        searchEntities(searchQuery, userId, {
          limit: opts.maxEntities,
          entityType: opts.entityTypes.length > 0 ? opts.entityTypes[0] : undefined,
          minConfidence: 0.6, // Lower threshold for broader matches
        }),
        searchMemories({
          query: searchQuery,
          userId,
          categories: opts.memoryCategories.length > 0 ? opts.memoryCategories : undefined,
          minStrength: opts.minMemoryStrength,
          limit: opts.maxMemories,
        }),
        // Always fetch high-importance preferences (e.g., name preferences)
        searchMemories({
          query: 'user preferences name', // Generic query to match preference memories
          userId,
          categories: ['preference'],
          minImportance: 0.8, // Only high-importance preferences
          limit: 5,
        }),
        // Fetch upcoming calendar events
        listEvents(userId, {
          timeMin: now.toISOString(),
          timeMax: nextWeek.toISOString(),
          maxResults: 20,
        }).catch((error) => {
          console.log(`${LOG_PREFIX} Could not fetch calendar events:`, error);
          return { events: [] };
        }),
        // Fetch pending tasks
        retrievePendingTasks(userId, 10),
      ]);

    const upcomingEvents = calendarResult.events || [];

    console.log(
      `${LOG_PREFIX} Retrieved ${entities.length} entities, ${memories.length} query-matched memories, ${preferenceMemories.length} high-importance preferences, ${upcomingEvents.length} upcoming events, and ${pendingTasks.length} pending tasks`
    );

    // Merge and deduplicate memories
    const memoryMap = new Map<string, MemoryWithStrength>();

    // Add preference memories first (higher priority)
    preferenceMemories.forEach((mem) => {
      memoryMap.set(mem.id, mem);
    });

    // Add query-matched memories (won't overwrite existing preferences)
    memories.forEach((mem) => {
      if (!memoryMap.has(mem.id)) {
        memoryMap.set(mem.id, mem);
      }
    });

    // Convert back to array
    const mergedMemories = Array.from(memoryMap.values());

    console.log(
      `${LOG_PREFIX} Merged to ${mergedMemories.length} total memories (${preferenceMemories.length} preferences + ${memories.length - (mergedMemories.length - preferenceMemories.length)} query-matched)`
    );

    return {
      entities: entities.slice(0, opts.maxEntities),
      memories: mergedMemories.slice(0, opts.maxMemories),
      upcomingEvents,
      pendingTasks,
      recentConversation: opts.includeRecentMessages ? recentMessages : undefined,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error retrieving context:`, error);

    // Return empty context on error
    return {
      entities: [],
      memories: [],
      upcomingEvents: [],
      pendingTasks: [],
      recentConversation: opts.includeRecentMessages ? recentMessages : undefined,
    };
  }
}

/**
 * Build context summary for logging/debugging
 */
export function summarizeContext(context: ChatContext): string {
  const entityTypes = context.entities.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const memoryCategories = context.memories.reduce(
    (acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return `
Context Summary:
- Entities: ${context.entities.length} total (${Object.entries(entityTypes)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ')})
- Memories: ${context.memories.length} total (${Object.entries(memoryCategories)
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(', ')})
- Upcoming Events: ${context.upcomingEvents.length} events
- Pending Tasks: ${context.pendingTasks.length} tasks
- Conversation History: ${context.recentConversation?.length || 0} messages
`.trim();
}
