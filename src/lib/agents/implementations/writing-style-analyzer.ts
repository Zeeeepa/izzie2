/**
 * Writing Style Analyzer Agent
 * Analyzes sent emails to learn user's writing style
 *
 * Part of the 5 Proactive Long-Running Background Agents (#89)
 */

import { google } from 'googleapis';
import { BaseAgent, createAgentFunction } from '../framework';
import { registerAgent } from '../registry';
import type { AgentConfig, AgentContext, AgentSource } from '../types';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';
import {
  analyzeWritingStyle,
  analyzeStyleForRecipient,
  saveWritingStyle,
  getOverallStyle,
  type WritingStyle,
  type EmailForAnalysis,
} from '@/lib/analysis/writing-style';

interface WritingStyleAnalyzerInput {
  userId: string;
  analyzeByRecipient?: boolean; // Also analyze per-recipient patterns
  minEmailsPerRecipient?: number;
}

interface WritingStyleAnalyzerOutput {
  overallStyle: WritingStyle;
  recipientStyles: WritingStyle[];
  emailsAnalyzed: number;
  recipientsAnalyzed: number;
  processingTime: number;
}

/**
 * Writing Style Analyzer Agent
 *
 * This agent analyzes the user's sent emails to learn their writing style:
 * - Formality level (formal, casual, mixed)
 * - Common greetings and sign-offs
 * - Average sentence/email length
 * - Response time patterns
 * - Active working hours
 *
 * Optionally analyzes per-recipient patterns to adapt style suggestions
 * based on who the user is emailing.
 */
class WritingStyleAnalyzerAgent extends BaseAgent<
  WritingStyleAnalyzerInput,
  WritingStyleAnalyzerOutput
> {
  name = 'writing-style-analyzer';
  version = '1.0.0';
  description = "Analyzes sent emails to learn user's writing style";

  config: AgentConfig = {
    trigger: 'izzie/agent.writing-style-analyzer',
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
    input: WritingStyleAnalyzerInput,
    context: AgentContext
  ): Promise<WritingStyleAnalyzerOutput> {
    const {
      userId,
      analyzeByRecipient = true,
      minEmailsPerRecipient = 5,
    } = input;

    const startTime = Date.now();
    let emailsAnalyzed = 0;
    const recipientStyles: WritingStyle[] = [];

    context.log('Starting writing style analysis', {
      analyzeByRecipient,
      minEmailsPerRecipient,
    });

    // Get cursor for incremental processing
    const cursor = await this.getCursor(userId, 'email');
    const lastProcessedDate = cursor?.lastProcessedDate || new Date(0);

    context.log('Retrieved cursor', {
      lastProcessedDate: lastProcessedDate.toISOString(),
    });

    try {
      // Initialize Gmail service to fetch sent emails
      const gmailService = await this.getGmailServiceForUser(userId);
      if (!gmailService) {
        context.log('Failed to initialize Gmail service');
        const defaultStyle = await getOverallStyle(userId);
        return {
          overallStyle: defaultStyle,
          recipientStyles: [],
          emailsAnalyzed: 0,
          recipientsAnalyzed: 0,
          processingTime: Date.now() - startTime,
        };
      }

      // Fetch sent emails for analysis (last 90 days)
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const emailBatch = await gmailService.fetchEmails({
        folder: 'sent',
        maxResults: 200,
        since,
      });

      const emails = emailBatch.emails;
      context.log(`Fetched ${emails.length} sent emails`);
      await context.trackProgress(20, emails.length);

      // Convert to EmailForAnalysis format
      const emailsForAnalysis: EmailForAnalysis[] = emails.map((email) => ({
        id: email.id,
        from: email.from.email,
        to: email.to.map((t) => t.email),
        cc: email.cc?.map((c) => c.email),
        subject: email.subject,
        body: email.body,
        sentAt: email.date,
        isReply: email.subject?.toLowerCase().startsWith('re:'),
      }));

      emailsAnalyzed = emailsForAnalysis.length;

      if (emailsAnalyzed === 0) {
        context.log('No emails to analyze');
        const defaultStyle = await getOverallStyle(userId);
        return {
          overallStyle: defaultStyle,
          recipientStyles: [],
          emailsAnalyzed: 0,
          recipientsAnalyzed: 0,
          processingTime: Date.now() - startTime,
        };
      }

      // Analyze overall writing style
      context.log('Analyzing overall writing style...');
      const overallStyle = analyzeWritingStyle(userId, emailsForAnalysis);

      // Save overall style
      await saveWritingStyle(overallStyle);
      context.log('Saved overall writing style', {
        formality: overallStyle.formality,
        avgLength: overallStyle.averageEmailLength,
      });

      await context.trackProgress(50, emailsAnalyzed);

      // Optionally analyze per-recipient patterns
      if (analyzeByRecipient) {
        context.log('Analyzing per-recipient styles...');

        // Group emails by recipient domain
        const emailsByDomain = this.groupEmailsByRecipientDomain(emailsForAnalysis);

        context.log(`Found ${emailsByDomain.size} unique recipient domains`);

        let domainsProcessed = 0;
        for (const [domain, domainEmails] of emailsByDomain) {
          // Skip domains with too few emails
          if (domainEmails.length < minEmailsPerRecipient) {
            continue;
          }

          try {
            // Analyze style for this domain
            const recipientStyle = analyzeStyleForRecipient(
              userId,
              domainEmails,
              domain
            );

            // Only save if it differs meaningfully from overall style
            if (this.isStyleSignificantlyDifferent(recipientStyle, overallStyle)) {
              await saveWritingStyle(recipientStyle);
              recipientStyles.push(recipientStyle);

              context.log(`Saved style for domain ${domain}`, {
                formality: recipientStyle.formality,
                emails: domainEmails.length,
              });
            }
          } catch (error) {
            context.log(`Error analyzing style for domain ${domain}`, {
              error: String(error),
            });
          }

          domainsProcessed++;
          const progress = 50 + Math.floor((domainsProcessed / emailsByDomain.size) * 40);
          await context.trackProgress(progress, emailsAnalyzed);
        }
      }

      // Update cursor
      await this.saveCursor(userId, 'email', {
        lastProcessedDate: new Date(),
        checkpoint: {
          emailsAnalyzed,
          recipientStylesFound: recipientStyles.length,
        },
      });

      await context.trackProgress(100, emailsAnalyzed);
    } catch (error) {
      context.log('Error in writing style analysis', { error: String(error) });
      // Return existing style on error
      const existingStyle = await getOverallStyle(userId);
      return {
        overallStyle: existingStyle,
        recipientStyles: [],
        emailsAnalyzed: 0,
        recipientsAnalyzed: 0,
        processingTime: Date.now() - startTime,
      };
    }

    const processingTime = Date.now() - startTime;
    const finalStyle = await getOverallStyle(userId);

    return {
      overallStyle: finalStyle,
      recipientStyles,
      emailsAnalyzed,
      recipientsAnalyzed: recipientStyles.length,
      processingTime,
    };
  }

  /**
   * Group emails by recipient domain
   */
  private groupEmailsByRecipientDomain(
    emails: EmailForAnalysis[]
  ): Map<string, EmailForAnalysis[]> {
    const byDomain = new Map<string, EmailForAnalysis[]>();

    for (const email of emails) {
      const allRecipients = [...email.to, ...(email.cc || [])];

      for (const recipient of allRecipients) {
        const domain = this.extractDomain(recipient);
        if (!domain) continue;

        const existing = byDomain.get(domain) || [];
        existing.push(email);
        byDomain.set(domain, existing);
      }
    }

    return byDomain;
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string | null {
    const match = email.match(/@([^>]+)/);
    if (!match) return null;

    const domain = `@${match[1].toLowerCase()}`;

    // Skip common personal email domains for recipient analysis
    const skipDomains = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com'];
    if (skipDomains.includes(domain)) {
      return null;
    }

    return domain;
  }

  /**
   * Check if a recipient style differs significantly from overall style
   */
  private isStyleSignificantlyDifferent(
    recipientStyle: WritingStyle,
    overallStyle: WritingStyle
  ): boolean {
    // Different formality
    if (recipientStyle.formality !== overallStyle.formality) {
      return true;
    }

    // Significantly different email length (>30% difference)
    const lengthDiff =
      Math.abs(recipientStyle.averageEmailLength - overallStyle.averageEmailLength) /
      overallStyle.averageEmailLength;

    if (lengthDiff > 0.3) {
      return true;
    }

    // Different common greetings
    const greetingOverlap = this.calculateOverlap(
      recipientStyle.commonGreetings,
      overallStyle.commonGreetings
    );

    if (greetingOverlap < 0.5) {
      return true;
    }

    // Different common sign-offs
    const signOffOverlap = this.calculateOverlap(
      recipientStyle.commonSignOffs,
      overallStyle.commonSignOffs
    );

    if (signOffOverlap < 0.5) {
      return true;
    }

    return false;
  }

  /**
   * Calculate overlap between two string arrays (Jaccard similarity)
   */
  private calculateOverlap(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1;
    if (arr1.length === 0 || arr2.length === 0) return 0;

    const set1 = new Set(arr1.map((s) => s.toLowerCase()));
    const set2 = new Set(arr2.map((s) => s.toLowerCase()));

    let intersection = 0;
    for (const item of set1) {
      if (set2.has(item)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  async onComplete(
    output: WritingStyleAnalyzerOutput,
    context: AgentContext
  ): Promise<void> {
    context.log('Writing style analysis completed', {
      emailsAnalyzed: output.emailsAnalyzed,
      recipientsAnalyzed: output.recipientsAnalyzed,
      overallFormality: output.overallStyle.formality,
      processingTimeMs: output.processingTime,
    });

    // Emit event for UI notification
    await context.emit('izzie/writing-style.analyzed', {
      userId: context.userId,
      emailsAnalyzed: output.emailsAnalyzed,
      recipientsAnalyzed: output.recipientsAnalyzed,
      overallStyle: {
        formality: output.overallStyle.formality,
        averageLength: output.overallStyle.averageEmailLength,
        commonGreetings: output.overallStyle.commonGreetings.slice(0, 3),
        commonSignOffs: output.overallStyle.commonSignOffs.slice(0, 3),
      },
    });
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    context.log('Writing style analysis failed', { error: error.message });
  }
}

export const writingStyleAnalyzerAgent = new WritingStyleAnalyzerAgent();
registerAgent(writingStyleAnalyzerAgent);
export const writingStyleAnalyzerFunction = createAgentFunction(writingStyleAnalyzerAgent);
