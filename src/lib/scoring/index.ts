/**
 * Scoring Module
 *
 * Exports scoring functionality for email significance, calendar events, and contact analysis.
 */

export { EmailScorer } from './email-scorer';
export { CalendarScorer } from './calendar-scorer';
export { ContactAnalyzer } from './contact-analyzer';

export type {
  SignificanceScore,
  ScoreFactor,
  ContactSignificance,
  ScoringConfig,
  ScoringContext,
  CalendarEventScore,
  CalendarScoringConfig,
} from './types';

export { DEFAULT_SCORING_CONFIG, DEFAULT_CALENDAR_SCORING_CONFIG } from './types';
