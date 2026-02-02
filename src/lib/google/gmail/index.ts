/**
 * Gmail Module
 * Exports all Gmail services and interfaces
 */

// Main service (facade) and factory function
export { GmailService, getGmailService } from './gmail-service';

// Individual services for direct use when needed
export { GmailMessageService } from './message-service';
export { GmailLabelService } from './label-service';
export { GmailSyncService } from './sync-service';
export { GmailComposeService } from './compose-service';
export { GmailFilterService } from './filter-service';

// Interfaces
export type {
  IGmailService,
  IGmailMessageService,
  IGmailLabelService,
  IGmailSyncService,
  IGmailComposeService,
  IGmailFilterService,
} from './interfaces';

// Utilities (for internal use or testing)
export * from './utils';
