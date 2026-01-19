/**
 * Research Query Planner
 * Decomposes complex queries into focused sub-queries
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import { buildQueryPlannerPrompt } from './prompts';
import type { ResearchSubTask, ResearchPlan } from './types';
import { randomUUID } from 'crypto';

interface SubQueryDefinition {
  query: string;
  purpose: string;
}

/**
 * Plan research by decomposing query into sub-tasks
 */
export async function planResearch(
  query: string,
  context?: string,
  options: { maxSubTasks?: number } = {}
): Promise<ResearchPlan> {
  const maxSubTasks = options.maxSubTasks || 5;
  const ai = getAIClient();

  // Build prompt
  const prompt = buildQueryPlannerPrompt(query, context);

  // Use cheap model for planning
  const response = await ai.chat(
    [{ role: 'user', content: prompt }],
    {
      model: MODELS.CLASSIFIER,
      maxTokens: 1000,
      temperature: 0.7,
      logCost: true,
    }
  );

  // Parse response
  let subQueries: SubQueryDefinition[];
  try {
    subQueries = JSON.parse(response.content);
  } catch (error) {
    console.error('[Planner] Failed to parse AI response:', response.content);
    // Fallback: use the original query as single sub-task
    subQueries = [{ query, purpose: 'Main research query' }];
  }

  // Validate and limit sub-queries
  if (!Array.isArray(subQueries)) {
    console.warn('[Planner] AI response is not an array, using fallback');
    subQueries = [{ query, purpose: 'Main research query' }];
  }

  // Limit to maxSubTasks
  if (subQueries.length > maxSubTasks) {
    console.log(`[Planner] Limiting ${subQueries.length} queries to ${maxSubTasks}`);
    subQueries = subQueries.slice(0, maxSubTasks);
  }

  // Create sub-tasks
  const subTasks: ResearchSubTask[] = subQueries.map((sq) => ({
    id: randomUUID(),
    query: sq.query,
    purpose: sq.purpose,
    status: 'pending',
  }));

  // Estimate cost and time
  const estimatedCost = response.usage.cost + subTasks.length * 0.02; // $0.02 per sub-task estimate
  const estimatedTime = subTasks.length * 10000; // 10 seconds per sub-task estimate

  console.log(
    `[Planner] Created ${subTasks.length} sub-tasks for query: "${query}"`
  );

  return {
    mainQuery: query,
    subTasks,
    estimatedCost,
    estimatedTime,
  };
}

/**
 * Validate sub-query results quality
 */
export function validateSubTaskResults(subTask: ResearchSubTask): boolean {
  if (subTask.status !== 'completed') {
    return false;
  }

  if (!subTask.results || subTask.results.length === 0) {
    console.warn(`[Planner] Sub-task ${subTask.id} has no results`);
    return false;
  }

  return true;
}

/**
 * Get completion status of research plan
 */
export function getPlanProgress(plan: ResearchPlan): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  progress: number;
} {
  const total = plan.subTasks.length;
  const completed = plan.subTasks.filter((st) => st.status === 'completed').length;
  const failed = plan.subTasks.filter((st) => st.status === 'failed').length;
  const pending = plan.subTasks.filter((st) => st.status === 'pending').length;

  return {
    total,
    completed,
    failed,
    pending,
    progress: total > 0 ? (completed / total) * 100 : 0,
  };
}
