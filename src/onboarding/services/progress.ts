/**
 * Progress Tracking Service
 *
 * Re-exports from the refactored progress module for backward compatibility.
 * The service has been decomposed into:
 *   - OnboardingStateService: State machine transitions
 *   - OnboardingDataService: Data tracking and aggregation
 *   - OnboardingSSEService: SSE client management
 *   - ProgressService: Facade composing the above
 *
 * @see ./progress/index.ts for the full API
 */

export {
  ProgressService,
  getProgressService,
  resetProgressService,
  OnboardingStateService,
  OnboardingDataService,
  OnboardingSSEService,
} from './progress/index';

export type {
  IOnboardingStateService,
  IOnboardingDataService,
  IOnboardingSSEService,
  EmailMetadata,
  DataStats,
  StateChangeCallback,
  DataChangeCallback,
} from './progress/index';
