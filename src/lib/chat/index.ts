/**
 * Chat Context System
 *
 * Unified exports for chat context retrieval and formatting.
 */

export {
  retrieveContext,
  extractQueryTerms,
  summarizeContext,
  type ChatContext,
  type ChatMessage,
  type ContextRetrievalOptions,
} from './context-retrieval';

export {
  formatContextForPrompt,
  buildSystemPrompt,
  formatContextSummary,
} from './context-formatter';

export {
  getSelfAwarenessContext,
  formatSelfAwarenessForPrompt,
  type SelfAwarenessContext,
  type ConnectorStatus,
} from './self-awareness';
