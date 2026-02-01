/**
 * Conversation History Chat Tool
 * Enables Izzie to search and recall past conversations
 */

import { z } from 'zod';
import {
  searchConversations,
  getConversationHistory,
  getRecentConversations,
} from '../conversation-search';

/**
 * Search conversations tool parameter schema
 */
export const searchConversationsSchema = z.object({
  query: z
    .string()
    .describe('Natural language search query to find relevant past conversations'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Maximum number of results to return (1-20, default: 5)'),
});

export type SearchConversationsParams = z.infer<typeof searchConversationsSchema>;

/**
 * Search conversations tool definition
 */
export const searchConversationsTool = {
  name: 'search_conversations',
  description:
    'Search through past conversation history using semantic search. Use this when you need to recall what was discussed previously, find context from earlier conversations, or when the user asks about something you discussed before. Returns the most relevant messages with their context.',
  parameters: searchConversationsSchema,

  /**
   * Execute conversation search
   * @param params - Tool parameters
   * @param userId - User ID who initiated the search
   * @returns Formatted search results
   */
  async execute(
    params: SearchConversationsParams,
    userId: string
  ): Promise<{ message: string; results: unknown[] }> {
    try {
      const validated = searchConversationsSchema.parse(params);

      console.log(`[Search Conversations Tool] Searching for "${validated.query}"`);

      const results = await searchConversations(userId, validated.query, validated.limit);

      if (results.length === 0) {
        return {
          message: `No relevant past conversations found for: "${validated.query}"`,
          results: [],
        };
      }

      // Format results for display
      const formattedResults = results.map((r, i) => ({
        rank: i + 1,
        role: r.role,
        content: r.content,
        similarity: Math.round(r.similarity * 100) / 100,
        date: r.createdAt.toISOString().split('T')[0],
        sessionTitle: r.sessionTitle || 'Untitled conversation',
      }));

      const summary = results
        .slice(0, 3)
        .map((r, i) => {
          const preview = r.content.substring(0, 100) + (r.content.length > 100 ? '...' : '');
          const date = r.createdAt.toISOString().split('T')[0];
          return `${i + 1}. [${r.role}] "${preview}" (${date}, ${Math.round(r.similarity * 100)}% match)`;
        })
        .join('\n');

      return {
        message: `Found ${results.length} relevant messages:\n\n${summary}`,
        results: formattedResults,
      };
    } catch (error) {
      console.error('[Search Conversations Tool] Failed:', error);
      throw new Error(
        `Failed to search conversations: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Get conversation history tool parameter schema
 */
export const getConversationHistorySchema = z.object({
  sessionId: z.string().uuid().describe('The session ID to get history for'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum number of messages to return (1-100, default: 50)'),
});

export type GetConversationHistoryParams = z.infer<typeof getConversationHistorySchema>;

/**
 * Get conversation history tool definition
 */
export const getConversationHistoryTool = {
  name: 'get_conversation_history',
  description:
    'Get the full conversation history for a specific session. Use this when you need to see the complete context of a past conversation that was found through search.',
  parameters: getConversationHistorySchema,

  /**
   * Execute get conversation history
   * @param params - Tool parameters
   * @param userId - User ID for authorization
   * @returns Formatted conversation history
   */
  async execute(
    params: GetConversationHistoryParams,
    userId: string
  ): Promise<{ message: string; history: unknown[] }> {
    try {
      const validated = getConversationHistorySchema.parse(params);

      console.log(`[Get Conversation History Tool] Getting history for session ${validated.sessionId}`);

      const history = await getConversationHistory(validated.sessionId, userId, validated.limit);

      if (history.length === 0) {
        return {
          message: `No messages found in session ${validated.sessionId}`,
          history: [],
        };
      }

      const formattedHistory = history.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt.toISOString(),
      }));

      const summary = history
        .slice(0, 5)
        .map((msg) => {
          const preview = msg.content.substring(0, 80) + (msg.content.length > 80 ? '...' : '');
          return `[${msg.role}] ${preview}`;
        })
        .join('\n');

      return {
        message: `Found ${history.length} messages in conversation:\n\n${summary}${history.length > 5 ? '\n...' : ''}`,
        history: formattedHistory,
      };
    } catch (error) {
      console.error('[Get Conversation History Tool] Failed:', error);
      throw new Error(
        `Failed to get conversation history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Get recent conversations tool parameter schema
 */
export const getRecentConversationsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Maximum number of conversations to return (1-20, default: 10)'),
  daysBack: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .default(30)
    .describe('How many days back to look (1-90, default: 30)'),
});

export type GetRecentConversationsParams = z.infer<typeof getRecentConversationsSchema>;

/**
 * Get recent conversations tool definition
 */
export const getRecentConversationsTool = {
  name: 'get_recent_conversations',
  description:
    'Get a list of recent conversations with summaries. Use this to see what conversations have happened recently, to provide context or remind the user about past discussions.',
  parameters: getRecentConversationsSchema,

  /**
   * Execute get recent conversations
   * @param params - Tool parameters
   * @param userId - User ID to get conversations for
   * @returns Formatted list of recent conversations
   */
  async execute(
    params: GetRecentConversationsParams,
    userId: string
  ): Promise<{ message: string; conversations: unknown[] }> {
    try {
      const validated = getRecentConversationsSchema.parse(params);

      console.log(`[Get Recent Conversations Tool] Getting recent conversations`);

      const conversations = await getRecentConversations(userId, validated.limit, validated.daysBack);

      if (conversations.length === 0) {
        return {
          message: `No conversations found in the last ${validated.daysBack} days.`,
          conversations: [],
        };
      }

      const formattedConversations = conversations.map((conv) => ({
        sessionId: conv.sessionId,
        title: conv.title || 'Untitled',
        lastMessageAt: conv.lastMessageAt.toISOString(),
        messageCount: conv.messageCount,
        preview: conv.preview,
      }));

      const summary = conversations
        .slice(0, 5)
        .map((conv, i) => {
          const title = conv.title || 'Untitled';
          const date = conv.lastMessageAt.toISOString().split('T')[0];
          const preview = conv.preview.substring(0, 60) + (conv.preview.length > 60 ? '...' : '');
          return `${i + 1}. "${title}" (${date}, ${conv.messageCount} messages)\n   ${preview}`;
        })
        .join('\n\n');

      return {
        message: `Found ${conversations.length} recent conversations:\n\n${summary}`,
        conversations: formattedConversations,
      };
    } catch (error) {
      console.error('[Get Recent Conversations Tool] Failed:', error);
      throw new Error(
        `Failed to get recent conversations: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
