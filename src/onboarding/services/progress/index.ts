/**
 * Progress Services Module
 *
 * Exports the refactored progress tracking services with a facade
 * that maintains backward compatibility.
 */

// Interfaces
export type {
  IOnboardingStateService,
  IOnboardingDataService,
  IOnboardingSSEService,
  EmailMetadata,
  DataStats,
  StateChangeCallback,
  DataChangeCallback,
} from './interfaces';

// Service implementations
export { OnboardingStateService } from './state-service';
export { OnboardingDataService } from './data-service';
export { OnboardingSSEService } from './sse-service';

// Facade
export { ProgressService } from './progress-service';

// Singleton instance
import { ProgressService } from './progress-service';

let progressServiceInstance: ProgressService | null = null;

export function getProgressService(): ProgressService {
  if (!progressServiceInstance) {
    progressServiceInstance = new ProgressService();
  }
  return progressServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetProgressService(): void {
  progressServiceInstance = null;
}
