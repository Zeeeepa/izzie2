/**
 * Email Processor Service
 *
 * Fetches sent emails day-by-day (newest first) and processes them
 * through the classifier to discover entities and relationships.
 */

import { google, Auth } from 'googleapis';
import { GmailService } from '@/lib/google/gmail';
import { getClassifierService, ClassifierService } from './classifier';
import { getProgressService, ProgressService } from './progress';
import type { Email } from '@/lib/google/types';
import type { ProcessingConfig, DEFAULT_PROCESSING_CONFIG, DayResult } from '../types';

const LOG_PREFIX = '[EmailProcessor]';

export class EmailProcessorService {
  private gmail: GmailService;
  private classifier: ClassifierService;
  private progress: ProgressService;
  private config: ProcessingConfig;

  constructor(
    auth: Auth.OAuth2Client,
    config: Partial<ProcessingConfig> = {}
  ) {
    this.gmail = new GmailService(auth);
    this.classifier = getClassifierService();
    this.progress = getProgressService();
    this.config = {
      batchSize: config.batchSize ?? 50,
      delayBetweenBatches: config.delayBetweenBatches ?? 500,
      maxEmailsPerDay: config.maxEmailsPerDay ?? 100,
      startDate: config.startDate,
      endDate: config.endDate,
    };

    console.log(`${LOG_PREFIX} Initialized with config:`, this.config);
  }

  /**
   * Set user identity for the classifier
   */
  setUserIdentity(email: string, name?: string): void {
    this.classifier.setUserIdentity({
      email,
      name,
      aliases: [],
    });
  }

  /**
   * Process sent emails day-by-day, newest first
   * Uses AbortSignal for cancellation support
   */
  async processSentEmails(signal?: AbortSignal): Promise<void> {
    console.log(`${LOG_PREFIX} Starting to process sent emails`);

    // Calculate date range
    const endDate = this.config.endDate ?? new Date();
    const startDate = this.config.startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

    // Generate list of days to process (newest first)
    const days = this.generateDayList(startDate, endDate);
    console.log(`${LOG_PREFIX} Processing ${days.length} days from ${days[days.length - 1]} to ${days[0]}`);

    this.progress.setBatchProgress(0, days.length);

    for (let i = 0; i < days.length; i++) {
      // Check for abort
      if (signal?.aborted) {
        console.log(`${LOG_PREFIX} Processing aborted`);
        return;
      }

      // Check for pause
      while (this.progress.getState() === 'paused') {
        await this.sleep(500);
        if (signal?.aborted) {
          console.log(`${LOG_PREFIX} Processing aborted while paused`);
          return;
        }
      }

      const day = days[i];
      this.progress.setCurrentDay(day);
      this.progress.setBatchProgress(i + 1, days.length);

      try {
        await this.processDayEmails(day, signal);
      } catch (error) {
        console.error(`${LOG_PREFIX} Error processing day ${day}:`, error);
        this.progress.recordError(
          `Failed to process ${day}`,
          error instanceof Error ? error.message : String(error)
        );
      }

      // Delay between days
      if (i < days.length - 1 && !signal?.aborted) {
        await this.sleep(this.config.delayBetweenBatches);
      }
    }

    console.log(`${LOG_PREFIX} Completed processing all days`);
    this.progress.complete();
  }

  /**
   * Process emails for a single day
   */
  private async processDayEmails(day: string, signal?: AbortSignal): Promise<DayResult> {
    console.log(`${LOG_PREFIX} Processing day: ${day}`);

    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    const result: DayResult = {
      date: day,
      emailsProcessed: 0,
      entities: [],
      relationships: [],
      errors: [],
    };

    try {
      // Fetch sent emails for this day
      const emails = await this.fetchSentEmailsForDay(dayStart, dayEnd);
      console.log(`${LOG_PREFIX} Found ${emails.length} sent emails for ${day}`);

      // Limit emails per day
      const emailsToProcess = emails.slice(0, this.config.maxEmailsPerDay);

      // Process in batches
      for (let i = 0; i < emailsToProcess.length; i += this.config.batchSize) {
        if (signal?.aborted) {
          console.log(`${LOG_PREFIX} Day processing aborted`);
          return result;
        }

        // Check for pause
        while (this.progress.getState() === 'paused') {
          await this.sleep(500);
          if (signal?.aborted) {
            return result;
          }
        }

        const batch = emailsToProcess.slice(i, i + this.config.batchSize);
        const batchResults = await this.classifier.classifyBatch(batch);

        // Record each email result
        for (let j = 0; j < batch.length; j++) {
          const email = batch[j];
          const extraction = batchResults[j];

          this.progress.recordEmail(
            {
              id: email.id,
              subject: email.subject,
              from: email.from.email,
              to: email.to.map((t) => t.email),
              date: email.date,
              snippet: email.snippet,
            },
            extraction.entities,
            extraction.relationships,
            extraction.spam.isSpam,
            extraction.spam.spamScore
          );

          result.emailsProcessed++;
          result.entities.push(...extraction.entities);
          result.relationships.push(...extraction.relationships);
        }

        // Delay between batches
        if (i + this.config.batchSize < emailsToProcess.length) {
          await this.sleep(this.config.delayBetweenBatches);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Error fetching emails for ${day}:`, error);
      result.errors.push(errorMessage);
      this.progress.recordError(`Failed to fetch emails for ${day}`, errorMessage);
    }

    console.log(
      `${LOG_PREFIX} Day ${day} complete: ` +
      `${result.emailsProcessed} emails, ` +
      `${result.entities.length} entities, ` +
      `${result.relationships.length} relationships`
    );

    return result;
  }

  /**
   * Fetch sent emails for a specific day
   */
  private async fetchSentEmailsForDay(start: Date, end: Date): Promise<Email[]> {
    // Gmail query for sent emails in date range
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Use searchEmails with date range query
    // Gmail search: in:sent after:YYYY-MM-DD before:YYYY-MM-DD
    const query = `in:sent after:${startStr} before:${this.addDay(endStr)}`;

    return await this.gmail.searchEmails(query, this.config.maxEmailsPerDay);
  }

  /**
   * Generate list of days to process (newest first)
   */
  private generateDayList(start: Date, end: Date): string[] {
    const days: string[] = [];
    const current = new Date(end);
    current.setHours(0, 0, 0, 0);

    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);

    while (current >= startDay) {
      days.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() - 1);
    }

    return days;
  }

  /**
   * Add one day to a date string (YYYY-MM-DD)
   */
  private addDay(dateStr: string): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Factory function to create processor with auth
export function createEmailProcessor(
  auth: Auth.OAuth2Client,
  config?: Partial<ProcessingConfig>
): EmailProcessorService {
  return new EmailProcessorService(auth, config);
}
