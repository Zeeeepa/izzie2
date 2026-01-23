/**
 * Agent Implementations Index
 * Exports all agent implementations and their Inngest functions
 *
 * Part of the 5 Proactive Long-Running Background Agents (#89)
 */

// Entity Discoverer Agent
export {
  entityDiscovererAgent,
  entityDiscovererFunction,
} from './entity-discoverer';

// Relationship Discoverer Agent
export {
  relationshipDiscovererAgent,
  relationshipDiscovererFunction,
} from './relationship-discoverer';

// Email Cleanup Agent
export {
  emailCleanupAgent,
  emailCleanupFunction,
} from './email-cleanup';

// ML Rule Inferrer Agent
export {
  mlRuleInferrerAgent,
  mlRuleInferrerFunction,
} from './ml-rule-inferrer';

// Writing Style Analyzer Agent
export {
  writingStyleAnalyzerAgent,
  writingStyleAnalyzerFunction,
} from './writing-style-analyzer';
