/**
 * OAuth Scope Checking Utilities
 *
 * Detects and warns users when they have insufficient permissions
 * for Google API operations. This is important for users who authenticated
 * before scope upgrades (e.g., having tasks.readonly instead of tasks).
 */

import { getGoogleTokens } from './index';

/**
 * Required scopes for full functionality
 * Maps feature names to the Google OAuth scopes they require
 */
export const REQUIRED_SCOPES = {
  // Tasks: Full read/write access (not readonly)
  tasks: 'https://www.googleapis.com/auth/tasks',
  tasksReadonly: 'https://www.googleapis.com/auth/tasks.readonly',

  // Gmail scopes
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  gmailSettings: 'https://www.googleapis.com/auth/gmail.settings.basic',

  // Calendar scopes
  calendar: 'https://www.googleapis.com/auth/calendar',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',

  // Drive scopes
  driveReadonly: 'https://www.googleapis.com/auth/drive.readonly',

  // Contacts scopes
  contactsReadonly: 'https://www.googleapis.com/auth/contacts.readonly',

  // Chat scopes
  chatSpacesReadonly: 'https://www.googleapis.com/auth/chat.spaces.readonly',
  chatMessagesReadonly: 'https://www.googleapis.com/auth/chat.messages.readonly',
} as const;

/**
 * Scope check result for a specific feature
 */
export interface ScopeCheckResult {
  /** Whether user has full access (read/write) for tasks */
  hasTasksFullAccess: boolean;
  /** Whether user has tasks.readonly but not full tasks scope */
  hasTasksReadonlyOnly: boolean;
  /** Whether user has Gmail modify access */
  hasGmailModify: boolean;
  /** Whether user has Gmail send access */
  hasGmailSend: boolean;
  /** Whether user has Calendar access */
  hasCalendar: boolean;
  /** Whether user has Drive readonly access */
  hasDriveReadonly: boolean;
  /** Whether user has Contacts readonly access */
  hasContactsReadonly: boolean;
  /** List of missing scopes that would enable additional features */
  missingScopes: string[];
  /** Whether user needs to reconnect to get updated scopes */
  needsReconnect: boolean;
  /** Raw scope string from the account (for debugging) */
  rawScope: string | null;
}

/**
 * Parse scope string into array of individual scopes
 * Google stores scopes as space-separated string
 */
function parseScopeString(scopeString: string | null): string[] {
  if (!scopeString) return [];
  return scopeString.split(' ').filter((s) => s.length > 0);
}

/**
 * Check if user has a specific scope
 */
function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope);
}

/**
 * Check user's OAuth scopes for a Google account
 *
 * @param userId - The user ID to check scopes for
 * @param accountId - Optional specific account ID
 * @returns Scope check result with detailed permission information
 */
export async function checkUserScopes(
  userId: string,
  accountId?: string
): Promise<ScopeCheckResult> {
  const tokens = await getGoogleTokens(userId, accountId);

  if (!tokens) {
    // No tokens found - user needs to connect Google account
    return {
      hasTasksFullAccess: false,
      hasTasksReadonlyOnly: false,
      hasGmailModify: false,
      hasGmailSend: false,
      hasCalendar: false,
      hasDriveReadonly: false,
      hasContactsReadonly: false,
      missingScopes: Object.values(REQUIRED_SCOPES),
      needsReconnect: true,
      rawScope: null,
    };
  }

  const scopes = parseScopeString(tokens.scope);
  const missingScopes: string[] = [];

  // Check Tasks scopes
  const hasTasksFullAccess = hasScope(scopes, REQUIRED_SCOPES.tasks);
  const hasTasksReadonlyOnly =
    hasScope(scopes, REQUIRED_SCOPES.tasksReadonly) && !hasTasksFullAccess;

  // If user has readonly but not full access, they need to reconnect
  if (hasTasksReadonlyOnly) {
    missingScopes.push(REQUIRED_SCOPES.tasks);
  } else if (!hasTasksFullAccess) {
    missingScopes.push(REQUIRED_SCOPES.tasks);
  }

  // Check Gmail scopes
  const hasGmailModify = hasScope(scopes, REQUIRED_SCOPES.gmailModify);
  const hasGmailSend = hasScope(scopes, REQUIRED_SCOPES.gmailSend);

  if (!hasGmailModify) {
    missingScopes.push(REQUIRED_SCOPES.gmailModify);
  }
  if (!hasGmailSend) {
    missingScopes.push(REQUIRED_SCOPES.gmailSend);
  }

  // Check Calendar scopes
  const hasCalendar = hasScope(scopes, REQUIRED_SCOPES.calendar);
  if (!hasCalendar) {
    missingScopes.push(REQUIRED_SCOPES.calendar);
  }

  // Check Drive scopes
  const hasDriveReadonly = hasScope(scopes, REQUIRED_SCOPES.driveReadonly);
  if (!hasDriveReadonly) {
    missingScopes.push(REQUIRED_SCOPES.driveReadonly);
  }

  // Check Contacts scopes
  const hasContactsReadonly = hasScope(scopes, REQUIRED_SCOPES.contactsReadonly);
  if (!hasContactsReadonly) {
    missingScopes.push(REQUIRED_SCOPES.contactsReadonly);
  }

  // User needs reconnect if they have old/insufficient scopes
  // Specifically: tasks.readonly without tasks is the most common case
  const needsReconnect = hasTasksReadonlyOnly || missingScopes.length > 0;

  return {
    hasTasksFullAccess,
    hasTasksReadonlyOnly,
    hasGmailModify,
    hasGmailSend,
    hasCalendar,
    hasDriveReadonly,
    hasContactsReadonly,
    missingScopes,
    needsReconnect,
    rawScope: tokens.scope,
  };
}

/**
 * Error message for insufficient task permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_TASKS_SCOPE_ERROR =
  'Your Google account needs reconnection to enable task management. ' +
  'You currently have read-only access to tasks. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for creating, updating, and completing tasks.';

/**
 * Check if user has write access to Google Tasks
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has full tasks access, false if readonly or missing
 */
export async function hasTasksWriteAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasTasksFullAccess;
}

/**
 * Validate tasks write access and throw helpful error if insufficient
 * Use this at the start of any task write operation
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireTasksWriteAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasTasksFullAccess) {
    throw new Error(INSUFFICIENT_TASKS_SCOPE_ERROR);
  }
}
