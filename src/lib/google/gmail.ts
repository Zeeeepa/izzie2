/**
 * Gmail Service
 * Re-exports from the refactored gmail module for backward compatibility
 */

// Re-export everything from the gmail module
export { GmailService, getGmailService } from './gmail/index';

// Re-export individual services for direct use
export {
  GmailMessageService,
  GmailLabelService,
  GmailSyncService,
  GmailComposeService,
  GmailFilterService,
} from './gmail/index';

// Re-export interfaces
export type {
  IGmailService,
  IGmailMessageService,
  IGmailLabelService,
  IGmailSyncService,
  IGmailComposeService,
  IGmailFilterService,
} from './gmail/index';
