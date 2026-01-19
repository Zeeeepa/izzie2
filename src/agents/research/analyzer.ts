/**
 * Research Content Analyzer
 * Analyzes fetched content for relevance, credibility, and findings
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import {
  buildRelevancePrompt,
  buildCredibilityPrompt,
  buildFindingExtractorPrompt,
  buildKeyPointsPrompt,
} from './prompts';
import type { ResearchFinding, SourceAnalysis } from './types';

interface RelevanceResult {
  score: number;
  reasoning: string;
}

interface CredibilityResult {
  score: number;
  reasoning: string;
  factors: string[];
}

/**
 * Analyze a source for relevance, credibility, and findings
 */
export async function analyzeSource(
  content: string,
  query: string,
  url: string,
  title?: string
): Promise<SourceAnalysis> {
  const ai = getAIClient();

  // Use cheap model for all analysis operations
  const model = MODELS.CLASSIFIER;

  console.log(`[Analyzer] Analyzing source: ${url}`);

  // Step 1: Score relevance
  const relevance = await scoreRelevance(content, query, ai, model);

  // Skip further analysis if not relevant
  if (relevance < 0.3) {
    console.log(`[Analyzer] Source ${url} is not relevant (score: ${relevance})`);
    return {
      url,
      relevance,
      credibility: 0,
      findings: [],
      keyPoints: [],
    };
  }

  // Step 2: Score credibility (in parallel with findings)
  const [credibility, findings, keyPoints] = await Promise.all([
    scoreCredibility(content, url, ai, model, title),
    extractFindings(content, query, url, ai, model),
    extractKeyPoints(content, ai, model),
  ]);

  console.log(
    `[Analyzer] Source ${url} - Relevance: ${relevance.toFixed(2)}, Credibility: ${credibility.toFixed(2)}, Findings: ${findings.length}`
  );

  return {
    url,
    relevance,
    credibility,
    findings,
    keyPoints,
  };
}

/**
 * Score source relevance to query
 */
async function scoreRelevance(
  content: string,
  query: string,
  ai: ReturnType<typeof getAIClient>,
  model: string
): Promise<number> {
  try {
    const prompt = buildRelevancePrompt(content, query);
    const response = await ai.chat(
      [{ role: 'user', content: prompt }],
      { model, maxTokens: 200, temperature: 0.3 }
    );

    const result: RelevanceResult = JSON.parse(response.content);
    return Math.max(0, Math.min(1, result.score)); // Clamp to [0, 1]
  } catch (error) {
    console.error('[Analyzer] Failed to score relevance:', error);
    return 0.5; // Default to medium relevance on error
  }
}

/**
 * Score source credibility
 */
async function scoreCredibility(
  content: string,
  url: string,
  ai: ReturnType<typeof getAIClient>,
  model: string,
  title?: string
): Promise<number> {
  try {
    const prompt = buildCredibilityPrompt(content, url, title);
    const response = await ai.chat(
      [{ role: 'user', content: prompt }],
      { model, maxTokens: 300, temperature: 0.3 }
    );

    const result: CredibilityResult = JSON.parse(response.content);
    return Math.max(0, Math.min(1, result.score)); // Clamp to [0, 1]
  } catch (error) {
    console.error('[Analyzer] Failed to score credibility:', error);
    return 0.5; // Default to medium credibility on error
  }
}

/**
 * Extract findings from content
 */
async function extractFindings(
  content: string,
  query: string,
  url: string,
  ai: ReturnType<typeof getAIClient>,
  model: string
): Promise<ResearchFinding[]> {
  try {
    const prompt = buildFindingExtractorPrompt(content, query, url);
    const response = await ai.chat(
      [{ role: 'user', content: prompt }],
      { model, maxTokens: 1500, temperature: 0.5 }
    );

    const findings = JSON.parse(response.content);

    // Validate and format findings
    if (!Array.isArray(findings)) {
      console.warn('[Analyzer] Findings is not an array');
      return [];
    }

    return findings.map((f: any) => ({
      claim: f.claim || '',
      evidence: f.evidence || '',
      confidence: Math.max(0, Math.min(1, f.confidence || 0.5)),
      sourceUrl: url,
      quote: f.quote || undefined,
    }));
  } catch (error) {
    console.error('[Analyzer] Failed to extract findings:', error);
    return [];
  }
}

/**
 * Extract key points from content
 */
async function extractKeyPoints(
  content: string,
  ai: ReturnType<typeof getAIClient>,
  model: string
): Promise<string[]> {
  try {
    const prompt = buildKeyPointsPrompt(content);
    const response = await ai.chat(
      [{ role: 'user', content: prompt }],
      { model, maxTokens: 500, temperature: 0.5 }
    );

    const keyPoints = JSON.parse(response.content);

    if (!Array.isArray(keyPoints)) {
      console.warn('[Analyzer] Key points is not an array');
      return [];
    }

    return keyPoints.slice(0, 5); // Limit to 5 key points
  } catch (error) {
    console.error('[Analyzer] Failed to extract key points:', error);
    return [];
  }
}

/**
 * Batch analyze multiple sources
 */
export async function analyzeSources(
  sources: Array<{ content: string; url: string; title?: string }>,
  query: string,
  options: { concurrency?: number } = {}
): Promise<SourceAnalysis[]> {
  const concurrency = options.concurrency || 3;
  const results: SourceAnalysis[] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);

    console.log(
      `[Analyzer] Processing batch ${i / concurrency + 1}/${Math.ceil(sources.length / concurrency)} (${batch.length} sources)`
    );

    const batchResults = await Promise.all(
      batch.map((source) =>
        analyzeSource(source.content, query, source.url, source.title)
      )
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Filter and rank sources by quality
 */
export function rankSources(analyses: SourceAnalysis[]): SourceAnalysis[] {
  return analyses
    .filter((a) => a.relevance >= 0.3) // Filter out low relevance
    .sort((a, b) => {
      // Sort by combined score (relevance + credibility + findings count)
      const scoreA = a.relevance * 0.4 + a.credibility * 0.4 + a.findings.length * 0.2;
      const scoreB = b.relevance * 0.4 + b.credibility * 0.4 + b.findings.length * 0.2;
      return scoreB - scoreA;
    });
}
