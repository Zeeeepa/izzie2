/**
 * Multi-Account Aggregation Functions
 *
 * Fetches data from all connected Google accounts and aggregates results.
 * Used for comprehensive context retrieval across multiple accounts.
 */

import { getAllGoogleAccounts } from '@/lib/auth';
import { listEvents, type CalendarEvent, type EventListResponse } from '@/lib/calendar';
import { getRecentEmails } from '@/lib/chat/email-retrieval';
import type { RecentEmailSummary } from '@/lib/chat/context-retrieval';

const LOG_PREFIX = '[MultiAccount]';

/**
 * Result from a single account's calendar query
 */
export interface AccountCalendarResult {
  accountId: string;
  accountEmail?: string;
  accountLabel?: string;
  events: CalendarEvent[];
  error?: string;
}

/**
 * Aggregated calendar events from all accounts
 */
export interface AggregatedCalendarEvents {
  events: Array<CalendarEvent & { accountId: string; accountEmail?: string }>;
  accountResults: AccountCalendarResult[];
  totalAccounts: number;
  successfulAccounts: number;
  failedAccounts: number;
}

/**
 * Result from a single account's email query
 */
export interface AccountEmailResult {
  accountId: string;
  accountEmail?: string;
  accountLabel?: string;
  emails: RecentEmailSummary[];
  error?: string;
}

/**
 * Aggregated emails from all accounts
 */
export interface AggregatedEmails {
  emails: Array<RecentEmailSummary & { accountId: string; accountEmail?: string }>;
  accountResults: AccountEmailResult[];
  totalAccounts: number;
  successfulAccounts: number;
  failedAccounts: number;
}

/**
 * Options for fetching calendar events across all accounts
 */
export interface GetAllAccountCalendarEventsOptions {
  timeMin?: string; // RFC3339 timestamp
  timeMax?: string; // RFC3339 timestamp
  maxResultsPerAccount?: number;
  calendarId?: string; // Defaults to 'primary'
}

/**
 * Options for fetching emails across all accounts
 */
export interface GetAllAccountEmailsOptions {
  maxResultsPerAccount?: number;
  hoursBack?: number;
}

/**
 * Fetch calendar events from all connected Google accounts
 *
 * Queries each connected account in parallel and aggregates results.
 * Failed accounts are logged but don't block other account results.
 *
 * @param userId - The user ID
 * @param options - Query options
 * @returns Aggregated calendar events with per-account breakdown
 */
export async function getAllAccountCalendarEvents(
  userId: string,
  options: GetAllAccountCalendarEventsOptions = {}
): Promise<AggregatedCalendarEvents> {
  const {
    timeMin,
    timeMax,
    maxResultsPerAccount = 50,
    calendarId = 'primary',
  } = options;

  console.log(`${LOG_PREFIX} Fetching calendar events from all accounts for user ${userId}`);

  // Get all connected Google accounts
  const accounts = await getAllGoogleAccounts(userId);

  if (accounts.length === 0) {
    console.log(`${LOG_PREFIX} No Google accounts found for user ${userId}`);
    return {
      events: [],
      accountResults: [],
      totalAccounts: 0,
      successfulAccounts: 0,
      failedAccounts: 0,
    };
  }

  console.log(`${LOG_PREFIX} Found ${accounts.length} Google account(s)`);

  // Query each account in parallel
  const accountPromises = accounts.map(async (account): Promise<AccountCalendarResult> => {
    try {
      const result = await listEvents(userId, {
        calendarId,
        timeMin,
        timeMax,
        maxResults: maxResultsPerAccount,
        accountId: account.id,
      });

      console.log(
        `${LOG_PREFIX} Retrieved ${result.events.length} events from account ${account.accountEmail || account.id}`
      );

      return {
        accountId: account.id,
        accountEmail: account.accountEmail || undefined,
        accountLabel: account.label || undefined,
        events: result.events,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `${LOG_PREFIX} Failed to fetch events from account ${account.accountEmail || account.id}:`,
        errorMessage
      );

      return {
        accountId: account.id,
        accountEmail: account.accountEmail || undefined,
        accountLabel: account.label || undefined,
        events: [],
        error: errorMessage,
      };
    }
  });

  const accountResults = await Promise.all(accountPromises);

  // Aggregate all events with account metadata
  const allEvents: Array<CalendarEvent & { accountId: string; accountEmail?: string }> = [];

  for (const result of accountResults) {
    for (const event of result.events) {
      allEvents.push({
        ...event,
        accountId: result.accountId,
        accountEmail: result.accountEmail,
      });
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date || '';
    const bTime = b.start.dateTime || b.start.date || '';
    return aTime.localeCompare(bTime);
  });

  const successfulAccounts = accountResults.filter((r) => !r.error).length;
  const failedAccounts = accountResults.filter((r) => r.error).length;

  console.log(
    `${LOG_PREFIX} Aggregated ${allEvents.length} total events from ${successfulAccounts}/${accounts.length} accounts`
  );

  return {
    events: allEvents,
    accountResults,
    totalAccounts: accounts.length,
    successfulAccounts,
    failedAccounts,
  };
}

/**
 * Fetch recent emails from all connected Google accounts
 *
 * Queries each connected account in parallel and aggregates results.
 * Failed accounts are logged but don't block other account results.
 *
 * @param userId - The user ID
 * @param options - Query options
 * @returns Aggregated emails with per-account breakdown
 */
export async function getAllAccountEmails(
  userId: string,
  options: GetAllAccountEmailsOptions = {}
): Promise<AggregatedEmails> {
  const { maxResultsPerAccount = 10, hoursBack = 24 } = options;

  console.log(`${LOG_PREFIX} Fetching emails from all accounts for user ${userId}`);

  // Get all connected Google accounts
  const accounts = await getAllGoogleAccounts(userId);

  if (accounts.length === 0) {
    console.log(`${LOG_PREFIX} No Google accounts found for user ${userId}`);
    return {
      emails: [],
      accountResults: [],
      totalAccounts: 0,
      successfulAccounts: 0,
      failedAccounts: 0,
    };
  }

  console.log(`${LOG_PREFIX} Found ${accounts.length} Google account(s)`);

  // Query each account in parallel
  const accountPromises = accounts.map(async (account): Promise<AccountEmailResult> => {
    try {
      const emails = await getRecentEmails(userId, {
        maxResults: maxResultsPerAccount,
        hoursBack,
        accountId: account.id,
      });

      console.log(
        `${LOG_PREFIX} Retrieved ${emails.length} emails from account ${account.accountEmail || account.id}`
      );

      return {
        accountId: account.id,
        accountEmail: account.accountEmail || undefined,
        accountLabel: account.label || undefined,
        emails,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `${LOG_PREFIX} Failed to fetch emails from account ${account.accountEmail || account.id}:`,
        errorMessage
      );

      return {
        accountId: account.id,
        accountEmail: account.accountEmail || undefined,
        accountLabel: account.label || undefined,
        emails: [],
        error: errorMessage,
      };
    }
  });

  const accountResults = await Promise.all(accountPromises);

  // Aggregate all emails with account metadata
  const allEmails: Array<RecentEmailSummary & { accountId: string; accountEmail?: string }> = [];

  for (const result of accountResults) {
    for (const email of result.emails) {
      allEmails.push({
        ...email,
        accountId: result.accountId,
        accountEmail: result.accountEmail,
      });
    }
  }

  // Sort by date (most recent first)
  allEmails.sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });

  const successfulAccounts = accountResults.filter((r) => !r.error).length;
  const failedAccounts = accountResults.filter((r) => r.error).length;

  console.log(
    `${LOG_PREFIX} Aggregated ${allEmails.length} total emails from ${successfulAccounts}/${accounts.length} accounts`
  );

  return {
    emails: allEmails,
    accountResults,
    totalAccounts: accounts.length,
    successfulAccounts,
    failedAccounts,
  };
}
