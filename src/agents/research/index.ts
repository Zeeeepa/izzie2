/**
 * Research Agent - Barrel Export
 * Main entry point for research agent module
 */

export { ResearchAgent } from './research-agent';
export { planResearch, getPlanProgress } from './planner';
export { analyzeSource, analyzeSources, rankSources } from './analyzer';
export { synthesize, generateCitations, calculateQualityScore } from './synthesizer';

export type {
  ResearchInput,
  ResearchOutput,
  ResearchFinding,
  ResearchSourceSummary,
  ResearchSubTask,
  SourceAnalysis,
  ResearchPlan,
  SynthesisResult,
} from './types';

export {
  buildQueryPlannerPrompt,
  buildRelevancePrompt,
  buildCredibilityPrompt,
  buildFindingExtractorPrompt,
  buildSynthesizerPrompt,
  buildKeyPointsPrompt,
} from './prompts';
