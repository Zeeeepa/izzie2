/**
 * LLM Usage Tracker
 *
 * Tracks LLM inference calls with detailed token counts and cost calculations.
 * Uses the llm_usage table for granular tracking by operation type.
 */

import { dbClient } from '@/lib/db/client';
import { llmUsage, type LlmOperationType } from '@/lib/db/schema';

/**
 * Cost rates per 1M tokens (input/output) via OpenRouter
 * Claude models as of February 2025
 */
export const LLM_COST_RATES: Record<string, { input: number; output: number }> = {
  // Anthropic Claude models via OpenRouter
  'claude-opus-4.5': { input: 3, output: 15 },
  'anthropic/claude-opus-4.5': { input: 3, output: 15 },
  'anthropic/claude-opus-4': { input: 15, output: 75 },
  'anthropic/claude-sonnet-4': { input: 3, output: 15 },
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },

  // Google models
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'google/gemini-2.0-flash-exp': { input: 0.1, output: 0.4 },

  // Mistral models
  'mistralai/mistral-small-3.2-24b-instruct': { input: 0.1, output: 0.3 },

  // OpenAI models
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/**
 * Default cost rate for unknown models (uses Claude Sonnet pricing as fallback)
 */
const DEFAULT_COST_RATE = { input: 3, output: 15 };

/**
 * Calculate cost for a given model and token counts
 * @param model - Model identifier
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Cost in USD
 */
export function calculateLLMCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = LLM_COST_RATES[model] || DEFAULT_COST_RATE;

  // Cost = (tokens / 1,000,000) * rate per million
  const inputCost = (inputTokens / 1_000_000) * rates.input;
  const outputCost = (outputTokens / 1_000_000) * rates.output;

  return inputCost + outputCost;
}

/**
 * Parameters for tracking LLM usage
 */
export interface TrackLLMUsageParams {
  userId: string;
  operationType: LlmOperationType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

/**
 * Track LLM usage for a user
 *
 * Records token usage and calculates cost based on model pricing.
 * Cost calculation for Claude via OpenRouter:
 * - Input: $3 per 1M tokens ($0.000003 per token)
 * - Output: $15 per 1M tokens ($0.000015 per token)
 *
 * @param params - Usage tracking parameters
 * @returns Promise<void> - Resolves when tracking is complete
 *
 * @example
 * ```typescript
 * await trackLLMUsage({
 *   userId: 'user-123',
 *   operationType: 'chat',
 *   model: 'anthropic/claude-sonnet-4',
 *   inputTokens: 1000,
 *   outputTokens: 500,
 *   metadata: { sessionId: 'abc' }
 * });
 * ```
 */
export async function trackLLMUsage(params: TrackLLMUsageParams): Promise<void> {
  const { userId, operationType, model, inputTokens, outputTokens, metadata } = params;

  try {
    const db = dbClient.getDb();
    const costUsd = calculateLLMCost(model, inputTokens, outputTokens);

    await db.insert(llmUsage).values({
      userId,
      operationType,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      metadata: metadata || null,
    });

    console.log(
      `[LLM Usage] Tracked: ${operationType} - ${model} - ${inputTokens + outputTokens} tokens, $${costUsd.toFixed(6)}`
    );
  } catch (error) {
    // Log error but don't throw - usage tracking should not break main functionality
    console.error('[LLM Usage] Failed to track usage:', error);
  }
}

/**
 * Track LLM usage in background (fire and forget)
 *
 * Same as trackLLMUsage but doesn't wait for completion.
 * Use this when you don't need to wait for the tracking to complete.
 *
 * @param params - Usage tracking parameters
 */
export function trackLLMUsageAsync(params: TrackLLMUsageParams): void {
  trackLLMUsage(params).catch((error) => {
    console.error('[LLM Usage] Async tracking failed:', error);
  });
}
