/**
 * Research Agent
 * Deep research agent with web search and synthesis
 */

import { BaseAgent } from '@/agents/base/agent';
import type { AgentContext, AgentResult } from '@/agents/base/types';
import { webSearch, batchFetchAndCache } from '@/lib/search';
import { planResearch, getPlanProgress } from './planner';
import { analyzeSources, rankSources } from './analyzer';
import { synthesize, generateCitations, calculateQualityScore } from './synthesizer';
import { saveResearchSources, saveResearchFindings } from '@/lib/db/research';
import { saveFindings } from '@/lib/weaviate/research-findings';
import type {
  ResearchInput,
  ResearchOutput,
  ResearchSubTask,
  ResearchSourceSummary,
} from './types';

export class ResearchAgent extends BaseAgent<ResearchInput, ResearchOutput> {
  constructor() {
    super({
      name: 'research',
      description: 'Deep research agent with web search and synthesis',
      version: '1.0.0',
      maxBudget: 0.5, // $0.50 default limit
      maxDuration: 300000, // 5 minutes
      retryConfig: {
        maxRetries: 2,
        backoffMs: 2000,
      },
    });
  }

  /**
   * Execute research task
   */
  async execute(
    input: ResearchInput,
    context: AgentContext
  ): Promise<AgentResult<ResearchOutput>> {
    const startTime = Date.now();
    const { query, context: userContext, maxSources = 10, excludeDomains = [] } = input;

    try {
      // Step 1: Plan research (10% progress)
      await context.updateProgress({
        progress: 10,
        currentStep: 'Planning research',
      });
      const plan = await planResearch(query, userContext, {
        maxSubTasks: Math.min(5, Math.ceil(maxSources / 2)),
      });

      console.log(
        `[ResearchAgent] Plan: ${plan.subTasks.length} sub-tasks, estimated cost: $${plan.estimatedCost.toFixed(4)}`
      );

      // Check if cancelled
      if (await context.isCancelled()) {
        throw new Error('Task cancelled during planning');
      }

      // Step 2: Execute searches for each sub-task (10-40% progress)
      await context.updateProgress({
        progress: 20,
        currentStep: 'Executing searches',
      });
      const searchResults = await this.executeSearches(plan.subTasks, {
        maxResults: Math.ceil(maxSources / plan.subTasks.length),
        excludeDomains,
      });

      // Update plan with results
      plan.subTasks.forEach((task, i) => {
        task.results = searchResults[i] || [];
        task.status = task.results.length > 0 ? 'completed' : 'failed';
      });

      const planProgress = getPlanProgress(plan);
      console.log(
        `[ResearchAgent] Searches complete: ${planProgress.completed}/${planProgress.total} successful`
      );

      await context.updateProgress({
        progress: 40,
        currentStep: 'Fetching content',
      });

      // Collect all unique URLs
      const allResults = plan.subTasks.flatMap((t) => t.results || []);
      const uniqueUrls = Array.from(new Set(allResults.map((r) => r.url))).slice(
        0,
        maxSources
      );

      console.log(`[ResearchAgent] Fetching ${uniqueUrls.length} unique URLs`);

      // Step 3: Fetch content (40-60% progress)
      const fetchResults = await batchFetchAndCache(context.task.id, uniqueUrls, {
        concurrency: 5,
        timeout: 30000,
      });

      // Filter successful fetches
      const successfulFetches = fetchResults.filter(
        (f) => !f.error && f.content.length > 100
      );

      console.log(
        `[ResearchAgent] Fetched ${successfulFetches.length}/${uniqueUrls.length} sources successfully`
      );

      if (successfulFetches.length === 0) {
        throw new Error('Failed to fetch any content');
      }

      await context.updateProgress({
        progress: 60,
        currentStep: 'Analyzing sources',
      });

      // Step 4: Analyze sources (60-80% progress)
      const analyses = await analyzeSources(
        successfulFetches.map((f) => ({
          content: f.content,
          url: f.url,
          title: f.title,
        })),
        query,
        { concurrency: 3 }
      );

      // Rank and filter sources
      const rankedSources = rankSources(analyses);

      console.log(
        `[ResearchAgent] Analyzed ${rankedSources.length} sources, found ${rankedSources.reduce((sum, s) => sum + s.findings.length, 0)} total findings`
      );

      await context.updateProgress({
        progress: 80,
        currentStep: 'Synthesizing findings',
      });

      // Step 5: Synthesize findings (80-100% progress)
      const allFindings = rankedSources.flatMap((s) => s.findings);
      const sourceSummaries: ResearchSourceSummary[] = rankedSources.map((s) => ({
        url: s.url,
        title:
          successfulFetches.find((f) => f.url === s.url)?.title || 'Untitled',
        relevance: s.relevance,
        credibility: s.credibility,
        keyPoints: s.keyPoints,
      }));

      const synthesis = await synthesize(allFindings, sourceSummaries, query);

      // Calculate quality score
      const quality = calculateQualityScore(allFindings, sourceSummaries);

      console.log(
        `[ResearchAgent] Research complete - Quality score: ${quality.score.toFixed(2)}`
      );

      await context.updateProgress({
        progress: 90,
        currentStep: 'Saving results',
      });

      // Step 6: Save sources and findings to database and Weaviate
      try {
        // Save sources to PostgreSQL
        await saveResearchSources(
          successfulFetches.map((f) => ({
            taskId: context.task.id,
            url: f.url,
            title: f.title,
            content: f.content,
            contentType: 'html',
            relevanceScore:
              rankedSources.find((s) => s.url === f.url)?.relevance || 0,
            credibilityScore:
              rankedSources.find((s) => s.url === f.url)?.credibility || 0,
            fetchStatus: 'fetched' as const,
            fetchedAt: new Date(),
          }))
        );

        // Save findings to both PostgreSQL and Weaviate
        if (synthesis.topFindings.length > 0) {
          // PostgreSQL
          await saveResearchFindings(
            synthesis.topFindings.map((f) => ({
              taskId: context.task.id,
              claim: f.claim,
              evidence: f.evidence,
              confidence: f.confidence,
              quote: f.quote,
            }))
          );

          // Weaviate (for semantic search)
          await saveFindings(
            synthesis.topFindings,
            context.task.id,
            context.userId
          );
        }

        console.log(
          `[ResearchAgent] Saved ${successfulFetches.length} sources and ${synthesis.topFindings.length} findings`
        );
      } catch (error) {
        console.error('[ResearchAgent] Failed to save results:', error);
        // Continue anyway - results are still in output
      }

      await context.updateProgress({
        progress: 100,
        currentStep: 'Complete',
      });

      // Calculate total cost and tokens
      const totalCost = context.task.totalCost;
      const totalTokens = context.task.tokensUsed;

      const output: ResearchOutput = {
        summary: synthesis.summary,
        findings: synthesis.topFindings,
        sources: sourceSummaries,
        totalTokens,
        totalCost,
      };

      const duration = Date.now() - startTime;
      console.log(
        `[ResearchAgent] Task complete in ${(duration / 1000).toFixed(1)}s, cost: $${totalCost.toFixed(4)}`
      );

      return {
        success: true,
        data: output,
        tokensUsed: totalTokens,
        totalCost,
      };
    } catch (error) {
      console.error('[ResearchAgent] Task failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: context.task.tokensUsed,
        totalCost: context.task.totalCost,
      };
    }
  }

  /**
   * Execute searches for sub-tasks
   */
  private async executeSearches(
    subTasks: ResearchSubTask[],
    options: { maxResults: number; excludeDomains: string[] }
  ): Promise<Array<any[]>> {
    const results = await Promise.all(
      subTasks.map(async (task) => {
        try {
          console.log(`[ResearchAgent] Searching: "${task.query}"`);
          const searchResults = await webSearch(task.query, {
            maxResults: options.maxResults,
          });

          // Filter excluded domains
          const filtered = searchResults.filter(
            (r) =>
              !options.excludeDomains.some((domain) => r.url.includes(domain))
          );

          return filtered;
        } catch (error) {
          console.error(`[ResearchAgent] Search failed for "${task.query}":`, error);
          return [];
        }
      })
    );

    return results;
  }

  /**
   * Validate research input
   */
  protected async validateInput(input: ResearchInput): Promise<boolean> {
    if (!input.query || input.query.trim().length === 0) {
      console.error('[ResearchAgent] Invalid input: query is required');
      return false;
    }

    if (input.query.length > 500) {
      console.error('[ResearchAgent] Invalid input: query too long (max 500 chars)');
      return false;
    }

    return true;
  }
}
