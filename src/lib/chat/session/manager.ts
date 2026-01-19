/**
 * Chat Session Manager
 *
 * Orchestrates session management, context building, and compression.
 * Implements the layered memory architecture:
 *
 * 1. System prompt (immutable)
 * 2. Entity context (from Weaviate)
 * 3. Current task (privileged, overwritten each turn)
 * 4. Compressed history (incrementally summarized)
 * 5. Recent messages (last 5 pairs verbatim)
 * 6. Current user message
 */

import type { ChatMessage as InternalChatMessage } from '@/types';
import type {
  ChatSession,
  ChatMessage,
  CurrentTask,
  StructuredLLMResponse,
} from './types';
import { WINDOW_SIZE } from './types';
import { SessionStorage, getSessionStorage } from './storage';
import { incrementalCompress } from './compression';

const LOG_PREFIX = '[SessionManager]';

/**
 * Message format for building LLM context
 */
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * ChatSessionManager
 *
 * Main orchestrator for session-based chat management
 */
export class ChatSessionManager {
  private storage: SessionStorage;

  constructor(storage?: SessionStorage) {
    this.storage = storage || getSessionStorage();
  }

  /**
   * Build complete context array for LLM
   *
   * Assembles the layered memory architecture into a message array.
   */
  buildContext(
    session: ChatSession,
    systemPrompt: string,
    entityContext: string,
    currentMessage: string
  ): Message[] {
    const messages: Message[] = [];

    console.log(`${LOG_PREFIX} Building context for session ${session.id}...`);

    // 1. System prompt (base instructions)
    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // 2. Entity context (people, projects, memories from Weaviate)
    if (entityContext && entityContext.trim().length > 0) {
      messages.push({
        role: 'system',
        content: `## Relevant Context\n${entityContext}`,
      });
    }

    // 3. Current task (privileged position)
    if (session.currentTask) {
      messages.push({
        role: 'system',
        content: this.formatCurrentTask(session.currentTask),
      });
    }

    // 4. Compressed history
    if (session.compressedHistory) {
      messages.push({
        role: 'system',
        content: `## Conversation History Summary\n${session.compressedHistory}`,
      });
    }

    // 5. Recent messages verbatim (last N pairs)
    for (const msg of session.recentMessages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // 6. Current user message
    messages.push({
      role: 'user',
      content: currentMessage,
    });

    console.log(
      `${LOG_PREFIX} Context built: ${messages.length} messages (task: ${session.currentTask ? 'yes' : 'no'}, history: ${session.compressedHistory ? 'yes' : 'no'}, recent: ${session.recentMessages.length})`
    );

    return messages;
  }

  /**
   * Process LLM response and update session
   *
   * Handles:
   * - Adding new messages to window
   * - Triggering compression when window exceeds limit
   * - Updating current task
   * - Persisting to database
   */
  async processResponse(
    session: ChatSession,
    userMessage: string,
    llmResponse: StructuredLLMResponse,
    metadata?: { tokensUsed?: number; model?: string }
  ): Promise<ChatSession> {
    console.log(`${LOG_PREFIX} Processing response for session ${session.id}...`);

    // Update current task (always overwrite, even if null)
    session.currentTask = llmResponse.currentTask
      ? {
          ...llmResponse.currentTask,
          updatedAt: new Date(),
        }
      : null;

    // Create message objects
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: llmResponse.response,
      timestamp: new Date(),
      metadata,
    };

    // Add to recent messages
    session.recentMessages.push(userMsg, assistantMsg);
    session.messageCount += 2;

    // Check if compression is needed (window exceeded)
    const maxMessages = WINDOW_SIZE * 2; // 5 pairs = 10 messages
    if (session.recentMessages.length > maxMessages) {
      console.log(
        `${LOG_PREFIX} Window exceeded (${session.recentMessages.length} > ${maxMessages}), compressing...`
      );
      await this.compressOldestPair(session);
    }

    // If LLM provided updated compressed history (shouldn't normally happen)
    if (llmResponse.updatedCompressedHistory) {
      console.log(
        `${LOG_PREFIX} LLM provided updated compressed history (unusual)`
      );
      session.compressedHistory = llmResponse.updatedCompressedHistory;
    }

    // Update timestamp and persist
    session.updatedAt = new Date();
    await this.storage.updateSession(session);

    console.log(
      `${LOG_PREFIX} Session updated (messages: ${session.messageCount}, recent: ${session.recentMessages.length})`
    );

    return session;
  }

  /**
   * Compress the oldest message pair and archive originals
   */
  private async compressOldestPair(session: ChatSession): Promise<void> {
    if (session.recentMessages.length < 2) {
      console.warn(
        `${LOG_PREFIX} Cannot compress - less than 2 messages in window`
      );
      return;
    }

    // Remove oldest pair (first user + assistant message)
    const oldestUser = session.recentMessages.shift()!;
    const oldestAssistant = session.recentMessages.shift()!;

    console.log(
      `${LOG_PREFIX} Compressing message pair (user: ${oldestUser.content.substring(0, 50)}...)`
    );

    // Archive originals for recovery
    if (!session.archivedMessages) {
      session.archivedMessages = [];
    }
    session.archivedMessages.push(oldestUser, oldestAssistant);

    // Incremental compression
    try {
      session.compressedHistory = await incrementalCompress(
        session.compressedHistory,
        oldestUser.content,
        oldestAssistant.content
      );

      console.log(
        `${LOG_PREFIX} Compression successful (summary: ${session.compressedHistory.length} chars, archived: ${session.archivedMessages.length} messages)`
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Compression failed:`, error);
      // Keep messages in archive even if compression fails
    }
  }

  /**
   * Format current task for system message
   */
  private formatCurrentTask(task: CurrentTask): string {
    const sections = [
      '## Current Task',
      `**Goal**: ${task.goal}`,
      `**Context**: ${task.context}`,
      `**Progress**: ${task.progress}`,
    ];

    if (task.blockers.length > 0) {
      sections.push(`**Blockers**: ${task.blockers.join(', ')}`);
    }

    if (task.nextSteps.length > 0) {
      sections.push(`**Next Steps**: ${task.nextSteps.join(', ')}`);
    }

    return sections.join('\n');
  }

  /**
   * Get or create session for user
   */
  async getOrCreateSession(
    userId: string,
    sessionId?: string
  ): Promise<ChatSession> {
    return this.storage.getOrCreateSession(userId, sessionId);
  }

  /**
   * Get user's sessions
   */
  async getUserSessions(userId: string, limit = 20): Promise<ChatSession[]> {
    return this.storage.getUserSessions(userId, limit);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    return this.storage.deleteSession(sessionId);
  }

  /**
   * Check if session belongs to user
   */
  async sessionBelongsToUser(
    sessionId: string,
    userId: string
  ): Promise<boolean> {
    return this.storage.sessionBelongsToUser(sessionId, userId);
  }

  /**
   * Generate title for session based on first message
   */
  async generateTitle(firstMessage: string): Promise<string> {
    // Simple title generation: take first few words
    const words = firstMessage.trim().split(/\s+/).slice(0, 6);
    let title = words.join(' ');

    if (firstMessage.split(/\s+/).length > 6) {
      title += '...';
    }

    return title.substring(0, 100); // Max 100 chars
  }
}

/**
 * Singleton instance
 */
let managerInstance: ChatSessionManager | null = null;

export function getSessionManager(): ChatSessionManager {
  if (!managerInstance) {
    managerInstance = new ChatSessionManager();
  }
  return managerInstance;
}
