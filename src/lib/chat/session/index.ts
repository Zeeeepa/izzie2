/**
 * Chat Session Module
 *
 * Complete session management with compression and current task tracking.
 */

export {
  type ChatSession,
  type ChatMessage,
  type CurrentTask,
  type StructuredLLMResponse,
  WINDOW_SIZE,
  RESPONSE_FORMAT_INSTRUCTION,
} from './types';

export { incrementalCompress, estimateCompressionCost } from './compression';

export { SessionStorage, getSessionStorage } from './storage';

export { ChatSessionManager, getSessionManager } from './manager';
