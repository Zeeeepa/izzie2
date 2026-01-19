/**
 * Research Result Synthesizer
 * Combines findings into coherent summary with citations
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import { buildSynthesizerPrompt } from './prompts';
import type {
  ResearchFinding,
  ResearchSourceSummary,
  SynthesisResult,
} from './types';

interface SynthesisOutput {
  summary: string;
  keyTakeaways: string[];
  uncertainties: string[];
  citations: string[];
}

/**
 * Synthesize research findings into coherent summary
 */
export async function synthesize(
  findings: ResearchFinding[],
  sources: ResearchSourceSummary[],
  originalQuery: string
): Promise<SynthesisResult> {
  const ai = getAIClient();

  console.log(
    `[Synthesizer] Synthesizing ${findings.length} findings from ${sources.length} sources`
  );

  // If no findings, return empty result
  if (findings.length === 0) {
    return {
      summary: 'No relevant findings were discovered for this query.',
      topFindings: [],
      citations: [],
    };
  }

  // Deduplicate and rank findings
  const topFindings = deduplicateAndRankFindings(findings);

  // Build prompt with top findings
  const prompt = buildSynthesizerPrompt(
    originalQuery,
    topFindings.slice(0, 20), // Limit to top 20 for prompt size
    sources.slice(0, 10) // Limit to top 10 sources
  );

  // Use standard model for synthesis (more sophisticated)
  const response = await ai.chat(
    [{ role: 'user', content: prompt }],
    {
      model: MODELS.GENERAL,
      maxTokens: 2000,
      temperature: 0.7,
      logCost: true,
    }
  );

  // Parse response
  let synthesis: SynthesisOutput;
  try {
    synthesis = JSON.parse(response.content);
  } catch (error) {
    console.error('[Synthesizer] Failed to parse AI response:', error);
    // Fallback: use raw content as summary
    synthesis = {
      summary: response.content,
      keyTakeaways: [],
      uncertainties: [],
      citations: sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`),
    };
  }

  console.log(`[Synthesizer] Generated summary (${response.usage.totalTokens} tokens)`);

  return {
    summary: synthesis.summary,
    topFindings: topFindings.slice(0, 10), // Return top 10 findings
    citations: synthesis.citations,
  };
}

/**
 * Deduplicate and rank findings by confidence and uniqueness
 */
function deduplicateAndRankFindings(
  findings: ResearchFinding[]
): ResearchFinding[] {
  // Sort by confidence (descending)
  const sorted = [...findings].sort((a, b) => b.confidence - a.confidence);

  // Deduplicate by claim similarity
  const unique: ResearchFinding[] = [];
  const seenClaims = new Set<string>();

  for (const finding of sorted) {
    const normalizedClaim = finding.claim.toLowerCase().trim();

    // Check for similar claims
    let isDuplicate = false;
    for (const seenClaim of seenClaims) {
      if (isSimilarClaim(normalizedClaim, seenClaim)) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(finding);
      seenClaims.add(normalizedClaim);
    }
  }

  return unique;
}

/**
 * Check if two claims are similar (basic string similarity)
 */
function isSimilarClaim(claim1: string, claim2: string): boolean {
  // Simple similarity check: more than 70% word overlap
  const words1 = claim1.split(/\s+/);
  const words2 = claim2.split(/\s+/);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = words1.filter((w) => set2.has(w));
  const union = [...new Set([...words1, ...words2])];

  const similarity = intersection.length / union.length;
  return similarity > 0.7;
}

/**
 * Generate citation list from sources
 */
export function generateCitations(sources: ResearchSourceSummary[]): string[] {
  return sources.map((source, i) => {
    const citation = `[${i + 1}] ${source.title} - ${source.url}`;
    return citation;
  });
}

/**
 * Extract quotes from findings
 */
export function extractQuotes(findings: ResearchFinding[]): string[] {
  return findings
    .filter((f) => f.quote && f.quote.length > 0)
    .map((f) => f.quote as string)
    .slice(0, 5); // Limit to 5 quotes
}

/**
 * Calculate research quality score
 */
export function calculateQualityScore(
  findings: ResearchFinding[],
  sources: ResearchSourceSummary[]
): {
  score: number;
  breakdown: {
    findingsScore: number;
    sourcesScore: number;
    credibilityScore: number;
  };
} {
  // Findings score (based on count and confidence)
  const avgConfidence =
    findings.length > 0
      ? findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length
      : 0;
  const findingsScore = Math.min(1, (findings.length / 10) * 0.5 + avgConfidence * 0.5);

  // Sources score (based on count and relevance)
  const avgRelevance =
    sources.length > 0
      ? sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length
      : 0;
  const sourcesScore = Math.min(1, (sources.length / 10) * 0.5 + avgRelevance * 0.5);

  // Credibility score (based on source credibility)
  const avgCredibility =
    sources.length > 0
      ? sources.reduce((sum, s) => sum + s.credibility, 0) / sources.length
      : 0;
  const credibilityScore = avgCredibility;

  // Overall score (weighted average)
  const score = findingsScore * 0.4 + sourcesScore * 0.3 + credibilityScore * 0.3;

  return {
    score,
    breakdown: {
      findingsScore,
      sourcesScore,
      credibilityScore,
    },
  };
}
