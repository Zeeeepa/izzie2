/**
 * Chat Session Compression
 *
 * Incremental summarization of conversation history.
 * Only summarizes the dropped message pair, then merges with existing summary.
 *
 * Key principles:
 * - Incremental: Only process new dropped messages
 * - Merge-based: Combine with existing summary
 * - Preserve specifics: Keep facts, decisions, names, dates
 * - Remove redundancy: Eliminate superseded information
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';

const LOG_PREFIX = '[SessionCompression]';

/**
 * Compression prompt template
 * Instructs LLM to merge new message pair with existing summary
 */
const COMPRESSION_PROMPT = `You are maintaining conversation context through incremental summarization.

EXISTING SUMMARY (may be empty for new conversations):
{existingSummary}

NEW MESSAGE PAIR TO INCORPORATE:
User: {userMessage}
Assistant: {assistantMessage}

Create an updated summary that:
1. MERGES the new exchange with the existing summary
2. Preserves key facts, decisions, names, dates, and specifics
3. Removes redundant or superseded information
4. Uses third person ("User asked...", "Assistant explained...")
5. Stays concise (aim for 200-400 words max)
6. Focuses on what's relevant for future context

Return ONLY the updated summary, no other text.`;

/**
 * Incrementally compress a conversation message pair
 *
 * Takes the oldest message pair being dropped from the window and merges it
 * with the existing compressed history.
 *
 * @param existingSummary - Current compressed history (null if first compression)
 * @param droppedUserMessage - User message being evicted from window
 * @param droppedAssistantMessage - Assistant response being evicted
 * @returns Updated compressed summary
 */
export async function incrementalCompress(
  existingSummary: string | null,
  droppedUserMessage: string,
  droppedAssistantMessage: string
): Promise<string> {
  const startTime = Date.now();

  // Build prompt with existing summary and new messages
  const prompt = COMPRESSION_PROMPT.replace(
    '{existingSummary}',
    existingSummary || 'None - this is the first compression.'
  )
    .replace('{userMessage}', droppedUserMessage)
    .replace('{assistantMessage}', droppedAssistantMessage);

  console.log(
    `${LOG_PREFIX} Compressing message pair (existing summary: ${existingSummary ? existingSummary.length : 0} chars)...`
  );

  try {
    // Use fast, cheap model for compression
    const aiClient = getAIClient();
    const response = await aiClient.chat(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        model: MODELS.GENERAL, // Use general model for good balance
        temperature: 0.3, // Lower temperature for consistency
        maxTokens: 500, // Reasonable limit for summary
        logCost: true,
      }
    );

    const updatedSummary = response.content.trim();
    const duration = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Compression complete (${duration}ms, ${response.usage.totalTokens} tokens, $${response.usage.cost.toFixed(6)})`
    );
    console.log(`${LOG_PREFIX} Summary length: ${updatedSummary.length} chars`);

    return updatedSummary;
  } catch (error) {
    console.error(`${LOG_PREFIX} Compression failed:`, error);

    // Fallback: Create simple concatenation if compression fails
    const fallbackSummary = existingSummary
      ? `${existingSummary}\n\nUser: ${droppedUserMessage.substring(0, 100)}...\nAssistant: ${droppedAssistantMessage.substring(0, 100)}...`
      : `User: ${droppedUserMessage.substring(0, 100)}...\nAssistant: ${droppedAssistantMessage.substring(0, 100)}...`;

    console.warn(`${LOG_PREFIX} Using fallback summary (${fallbackSummary.length} chars)`);

    return fallbackSummary;
  }
}

/**
 * Estimate token count for compression cost prediction
 */
export function estimateCompressionCost(
  existingSummary: string | null,
  userMessage: string,
  assistantMessage: string
): number {
  // Rough estimate: 4 characters per token
  const inputChars =
    (existingSummary?.length || 0) + userMessage.length + assistantMessage.length + 500; // + prompt template
  const outputChars = 400 * 4; // Assume 400 word summary

  const estimatedTokens = Math.ceil((inputChars + outputChars) / 4);

  return estimatedTokens;
}
