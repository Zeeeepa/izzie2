/**
 * Email Cleanup Agent
 * Analyzes emails and suggests/performs cleanup actions
 *
 * Part of the 5 Proactive Long-Running Background Agents (#89)
 */

import { google } from 'googleapis';
import { BaseAgent, createAgentFunction } from '../framework';
import { registerAgent } from '../registry';
import type { AgentConfig, AgentContext, AgentSource } from '../types';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';

/**
 * Newsletter detection patterns
 */
const NEWSLETTER_PATTERNS = [
  /unsubscribe/i,
  /opt.?out/i,
  /email preferences/i,
  /manage.*subscription/i,
  /mailing list/i,
  /newsletter/i,
  /weekly digest/i,
  /daily summary/i,
];

/**
 * Promotional email patterns
 */
const PROMOTIONAL_PATTERNS = [
  /limited time/i,
  /special offer/i,
  /% off/i,
  /sale ends/i,
  /act now/i,
  /exclusive deal/i,
  /free shipping/i,
  /discount code/i,
  /promo code/i,
];

/**
 * Notification email patterns
 */
const NOTIFICATION_PATTERNS = [
  /notification/i,
  /alert/i,
  /automated message/i,
  /do not reply/i,
  /noreply/i,
  /no-reply/i,
  /automated/i,
];

type CleanupAction = 'archive' | 'delete' | 'label' | 'unsubscribe';
type EmailCategory = 'newsletter' | 'promotional' | 'notification' | 'old_thread' | 'duplicate' | 'low_priority';

interface CleanupRule {
  category: EmailCategory;
  action: CleanupAction;
  confidence: number;
  reason: string;
}

interface CleanupSuggestion {
  emailId: string;
  subject: string;
  from: string;
  rule: CleanupRule;
  suggestedAt: Date;
}

interface EmailCleanupInput {
  userId: string;
  dryRun?: boolean; // If true, only suggest but don't execute
  categories?: EmailCategory[];
  minConfidence?: number;
}

interface EmailCleanupOutput {
  suggestionsGenerated: number;
  actionsExecuted: number;
  suggestions: CleanupSuggestion[];
  categoryBreakdown: Record<string, number>;
  processingTime: number;
}

/**
 * Email Cleanup Agent
 *
 * This agent analyzes the user's inbox to identify cleanup opportunities:
 * - Newsletters that are never opened
 * - Promotional emails older than X days
 * - Notification emails that can be archived
 * - Old threads with no recent activity
 *
 * Supports dry-run mode to generate suggestions without taking action.
 */
class EmailCleanupAgent extends BaseAgent<EmailCleanupInput, EmailCleanupOutput> {
  name = 'email-cleanup';
  version = '1.0.0';
  description = 'Analyzes emails and suggests/performs cleanup actions';

  config: AgentConfig = {
    trigger: 'izzie/agent.email-cleanup',
    maxConcurrency: 1,
    retries: 3,
    timeout: 600000, // 10 minutes
  };

  sources: AgentSource[] = ['email'];

  /**
   * Initialize Gmail service with user's OAuth tokens
   */
  private async getGmailServiceForUser(userId: string): Promise<GmailService | null> {
    const tokens = await getGoogleTokens(userId);
    if (!tokens) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    oauth2Client.setCredentials({
      access_token: tokens.accessToken || undefined,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    // Auto-refresh tokens if needed
    oauth2Client.on('tokens', async (newTokens) => {
      await updateGoogleTokens(userId, newTokens);
    });

    return new GmailService(oauth2Client);
  }

  async execute(
    input: EmailCleanupInput,
    context: AgentContext
  ): Promise<EmailCleanupOutput> {
    const {
      userId,
      dryRun = true, // Default to dry run for safety
      categories = ['newsletter', 'promotional', 'notification', 'old_thread'],
      minConfidence = 0.7,
    } = input;

    const startTime = Date.now();
    const suggestions: CleanupSuggestion[] = [];
    const categoryBreakdown: Record<string, number> = {};
    let actionsExecuted = 0;

    context.log('Starting email cleanup analysis', {
      dryRun,
      categories,
      minConfidence,
    });

    // Get cursor for incremental processing
    const cursor = await this.getCursor(userId, 'email');
    const lastProcessedDate = cursor?.lastProcessedDate || new Date(0);

    context.log('Retrieved cursor', {
      lastProcessedDate: lastProcessedDate.toISOString(),
    });

    try {
      // Initialize Gmail service to fetch full email data
      const gmailService = await this.getGmailServiceForUser(userId);
      if (!gmailService) {
        context.log('Failed to initialize Gmail service');
        return {
          suggestionsGenerated: 0,
          actionsExecuted: 0,
          suggestions: [],
          categoryBreakdown: {},
          processingTime: Date.now() - startTime,
        };
      }

      // Fetch recent emails for analysis (last week from inbox)
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const emailBatch = await gmailService.fetchEmails({
        folder: 'inbox',
        maxResults: 100,
        since,
      });

      const emails = emailBatch.emails;
      context.log(`Analyzing ${emails.length} emails for cleanup opportunities`);

      // Analyze each email
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];

        try {
          // Categorize the email using full email data
          const rule = this.categorizeEmail(
            {
              id: email.id,
              subject: email.subject,
              from: email.from.email,
              body: email.body,
              date: email.date,
            },
            categories,
            minConfidence
          );

          if (rule) {
            const suggestion: CleanupSuggestion = {
              emailId: email.id,
              subject: email.subject,
              from: email.from.email,
              rule,
              suggestedAt: new Date(),
            };

            suggestions.push(suggestion);

            // Track category breakdown
            categoryBreakdown[rule.category] =
              (categoryBreakdown[rule.category] || 0) + 1;

            // Execute action if not dry run
            if (!dryRun && rule.confidence >= minConfidence) {
              const success = await this.executeCleanupAction(
                gmailService,
                email.id,
                rule.action,
                context
              );

              if (success) {
                actionsExecuted++;
              }
            }
          }
        } catch (error) {
          context.log('Error analyzing email', {
            emailId: email.id,
            error: String(error),
          });
        }

        // Update progress
        const progress = Math.floor(((i + 1) / emails.length) * 100);
        await context.trackProgress(progress, i + 1);
      }

      // Update cursor
      await this.saveCursor(userId, 'email', {
        lastProcessedDate: new Date(),
        checkpoint: {
          suggestionsGenerated: suggestions.length,
          actionsExecuted,
        },
      });
    } catch (error) {
      context.log('Error in email cleanup', { error: String(error) });
    }

    const processingTime = Date.now() - startTime;

    return {
      suggestionsGenerated: suggestions.length,
      actionsExecuted,
      suggestions: suggestions.slice(0, 50), // Limit returned suggestions
      categoryBreakdown,
      processingTime,
    };
  }

  /**
   * Categorize an email and determine cleanup action
   */
  private categorizeEmail(
    email: { id: string; subject: string; from: string; body: string; date: Date },
    allowedCategories: EmailCategory[],
    minConfidence: number
  ): CleanupRule | null {
    const textToAnalyze = `${email.subject} ${email.body}`.toLowerCase();
    const fromAddress = email.from.toLowerCase();

    // Check for newsletters
    if (allowedCategories.includes('newsletter')) {
      const newsletterScore = this.calculatePatternScore(
        textToAnalyze,
        NEWSLETTER_PATTERNS
      );

      if (newsletterScore >= minConfidence) {
        return {
          category: 'newsletter',
          action: 'archive',
          confidence: newsletterScore,
          reason: 'Detected newsletter or subscription email',
        };
      }
    }

    // Check for promotional emails
    if (allowedCategories.includes('promotional')) {
      const promotionalScore = this.calculatePatternScore(
        textToAnalyze,
        PROMOTIONAL_PATTERNS
      );

      if (promotionalScore >= minConfidence) {
        return {
          category: 'promotional',
          action: 'archive',
          confidence: promotionalScore,
          reason: 'Detected promotional or marketing email',
        };
      }
    }

    // Check for notification emails
    if (allowedCategories.includes('notification')) {
      const notificationScore = this.calculatePatternScore(
        textToAnalyze,
        NOTIFICATION_PATTERNS
      );

      // Also check from address for noreply patterns
      const isNoReply = /noreply|no-reply|donotreply/.test(fromAddress);
      const adjustedScore = isNoReply
        ? Math.min(1, notificationScore + 0.3)
        : notificationScore;

      if (adjustedScore >= minConfidence) {
        return {
          category: 'notification',
          action: 'archive',
          confidence: adjustedScore,
          reason: 'Detected automated notification email',
        };
      }
    }

    // Check for old threads (emails older than 30 days with no follow-up)
    if (allowedCategories.includes('old_thread')) {
      const ageInDays =
        (Date.now() - email.date.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays > 30) {
        return {
          category: 'old_thread',
          action: 'archive',
          confidence: Math.min(1, 0.6 + ageInDays / 100), // Higher confidence for older emails
          reason: `Email is ${Math.floor(ageInDays)} days old`,
        };
      }
    }

    return null;
  }

  /**
   * Calculate pattern match score
   */
  private calculatePatternScore(
    text: string,
    patterns: RegExp[]
  ): number {
    let matches = 0;

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matches++;
      }
    }

    // Return a score based on how many patterns matched
    return matches > 0 ? Math.min(1, 0.5 + matches * 0.15) : 0;
  }

  /**
   * Execute a cleanup action on an email
   */
  private async executeCleanupAction(
    gmailService: GmailService,
    emailId: string,
    action: CleanupAction,
    context: AgentContext
  ): Promise<boolean> {
    try {
      switch (action) {
        case 'archive':
          await gmailService.archiveEmail(emailId);
          context.log('Archived email', { emailId });
          return true;

        case 'delete':
          await gmailService.trashEmail(emailId);
          context.log('Trashed email', { emailId });
          return true;

        case 'label':
          // Find or create cleanup label
          const cleanupLabel = await gmailService.findLabelByName('Izzie/Cleanup');
          if (cleanupLabel) {
            await gmailService.applyLabel(emailId, cleanupLabel.id);
            context.log('Labeled email for cleanup', { emailId });
            return true;
          }
          return false;

        case 'unsubscribe':
          // Unsubscribe requires user confirmation, so just mark for review
          context.log('Email marked for unsubscribe review', { emailId });
          return false;

        default:
          return false;
      }
    } catch (error) {
      context.log('Failed to execute cleanup action', {
        emailId,
        action,
        error: String(error),
      });
      return false;
    }
  }

  async onComplete(output: EmailCleanupOutput, context: AgentContext): Promise<void> {
    context.log('Email cleanup completed', {
      suggestionsGenerated: output.suggestionsGenerated,
      actionsExecuted: output.actionsExecuted,
      processingTimeMs: output.processingTime,
    });

    // Emit event for UI notification
    if (output.suggestionsGenerated > 0) {
      await context.emit('izzie/email.cleanup.suggestions', {
        userId: context.userId,
        count: output.suggestionsGenerated,
        actionsExecuted: output.actionsExecuted,
        breakdown: output.categoryBreakdown,
      });
    }
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    context.log('Email cleanup failed', { error: error.message });
  }
}

export const emailCleanupAgent = new EmailCleanupAgent();
registerAgent(emailCleanupAgent);
export const emailCleanupFunction = createAgentFunction(emailCleanupAgent);
