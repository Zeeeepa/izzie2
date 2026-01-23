/**
 * ML Rule Inferrer Agent
 * Learns user behavior patterns to suggest automation rules
 *
 * Part of the 5 Proactive Long-Running Background Agents (#89)
 */

import { google } from 'googleapis';
import { BaseAgent, createAgentFunction } from '../framework';
import { registerAgent } from '../registry';
import type { AgentConfig, AgentContext, AgentSource } from '../types';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';
import { listEvents } from '@/lib/calendar';

/**
 * Pattern types that can be inferred
 */
type PatternType =
  | 'email_response'
  | 'email_label'
  | 'email_archive'
  | 'calendar_accept'
  | 'calendar_decline'
  | 'calendar_reschedule';

/**
 * Confidence levels for inferred rules
 */
type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * An inferred automation rule
 */
interface InferredRule {
  id: string;
  patternType: PatternType;
  trigger: {
    type: 'email' | 'calendar';
    conditions: Record<string, string | string[]>;
  };
  action: {
    type: string;
    parameters: Record<string, unknown>;
  };
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  supportingEvidence: number; // Number of examples supporting this rule
  suggestedAt: Date;
  description: string;
}

/**
 * Email action pattern for analysis
 */
interface EmailActionPattern {
  from: string;
  fromDomain: string;
  subject: string;
  labels: string[];
  wasArchived: boolean;
  wasDeleted: boolean;
  responseTime?: number; // in minutes
  hadResponse: boolean;
}

/**
 * Calendar action pattern for analysis
 */
interface CalendarActionPattern {
  organizer: string;
  organizerDomain: string;
  title: string;
  attendeeCount: number;
  wasAccepted: boolean;
  wasDeclined: boolean;
  wasTentative: boolean;
  duration: number; // in minutes
}

interface MLRuleInferrerInput {
  userId: string;
  minSupport?: number; // Minimum examples to support a rule
  minConfidence?: number;
}

interface MLRuleInferrerOutput {
  rulesInferred: number;
  patternsAnalyzed: number;
  rules: InferredRule[];
  patternBreakdown: Record<string, number>;
  processingTime: number;
}

/**
 * ML Rule Inferrer Agent
 *
 * This agent analyzes historical user actions to identify patterns
 * that could be automated:
 *
 * - Emails from certain senders always get labeled
 * - Meeting invites from specific domains always accepted
 * - Certain types of emails always archived quickly
 * - Response patterns based on sender importance
 *
 * Uses frequency analysis and pattern matching to infer rules
 * with confidence scores.
 */
class MLRuleInferrerAgent extends BaseAgent<MLRuleInferrerInput, MLRuleInferrerOutput> {
  name = 'ml-rule-inferrer';
  version = '1.0.0';
  description = 'Learns user behavior patterns to suggest automation rules';

  config: AgentConfig = {
    trigger: 'izzie/agent.ml-rule-inferrer',
    maxConcurrency: 1,
    retries: 3,
    timeout: 600000, // 10 minutes
  };

  sources: AgentSource[] = ['email', 'calendar'];

  async execute(
    input: MLRuleInferrerInput,
    context: AgentContext
  ): Promise<MLRuleInferrerOutput> {
    const { userId, minSupport = 3, minConfidence = 0.7 } = input;
    const startTime = Date.now();
    const rules: InferredRule[] = [];
    const patternBreakdown: Record<string, number> = {};
    let patternsAnalyzed = 0;

    context.log('Starting ML rule inference', { minSupport, minConfidence });

    // Get cursor for incremental processing
    const cursor = await this.getCursor(userId, 'email');
    const lastProcessedDate = cursor?.lastProcessedDate || new Date(0);

    context.log('Retrieved cursor', {
      lastProcessedDate: lastProcessedDate.toISOString(),
    });

    try {
      // Collect email action patterns
      const emailPatterns = await this.collectEmailPatterns(userId, context);
      patternsAnalyzed += emailPatterns.length;

      context.log(`Collected ${emailPatterns.length} email patterns`);
      await context.trackProgress(30, emailPatterns.length);

      // Collect calendar action patterns
      const calendarPatterns = await this.collectCalendarPatterns(userId, context);
      patternsAnalyzed += calendarPatterns.length;

      context.log(`Collected ${calendarPatterns.length} calendar patterns`);
      await context.trackProgress(50, patternsAnalyzed);

      // Analyze email patterns for rules
      const emailRules = this.inferEmailRules(
        emailPatterns,
        minSupport,
        minConfidence
      );

      for (const rule of emailRules) {
        rules.push(rule);
        patternBreakdown[rule.patternType] =
          (patternBreakdown[rule.patternType] || 0) + 1;
      }

      context.log(`Inferred ${emailRules.length} email rules`);
      await context.trackProgress(75, patternsAnalyzed);

      // Analyze calendar patterns for rules
      const calendarRules = this.inferCalendarRules(
        calendarPatterns,
        minSupport,
        minConfidence
      );

      for (const rule of calendarRules) {
        rules.push(rule);
        patternBreakdown[rule.patternType] =
          (patternBreakdown[rule.patternType] || 0) + 1;
      }

      context.log(`Inferred ${calendarRules.length} calendar rules`);
      await context.trackProgress(100, patternsAnalyzed);

      // Update cursor
      await this.saveCursor(userId, 'email', {
        lastProcessedDate: new Date(),
        checkpoint: {
          patternsAnalyzed,
          rulesInferred: rules.length,
        },
      });
    } catch (error) {
      context.log('Error in ML rule inference', { error: String(error) });
    }

    const processingTime = Date.now() - startTime;

    return {
      rulesInferred: rules.length,
      patternsAnalyzed,
      rules,
      patternBreakdown,
      processingTime,
    };
  }

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

  /**
   * Collect email action patterns from recent emails
   */
  private async collectEmailPatterns(
    userId: string,
    context: AgentContext
  ): Promise<EmailActionPattern[]> {
    const patterns: EmailActionPattern[] = [];

    try {
      const gmailService = await this.getGmailServiceForUser(userId);
      if (!gmailService) {
        context.log('Failed to initialize Gmail service');
        return patterns;
      }

      // Fetch emails from last 30 days
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const emailBatch = await gmailService.fetchEmails({
        folder: 'all',
        maxResults: 100,
        since,
      });

      for (const email of emailBatch.emails) {
        const fromDomain = this.extractDomain(email.from.email);

        patterns.push({
          from: email.from.email,
          fromDomain,
          subject: email.subject,
          labels: email.labels || [],
          wasArchived: !email.labels?.includes('INBOX'),
          wasDeleted: email.labels?.includes('TRASH') || false,
          hadResponse: false, // Would need to check sent folder
          responseTime: undefined,
        });
      }
    } catch (error) {
      context.log('Error collecting email patterns', { error: String(error) });
    }

    return patterns;
  }

  /**
   * Collect calendar action patterns from recent events
   */
  private async collectCalendarPatterns(
    userId: string,
    context: AgentContext
  ): Promise<CalendarActionPattern[]> {
    const patterns: CalendarActionPattern[] = [];

    try {
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const response = await listEvents(userId, {
        timeMin: monthAgo.toISOString(),
        timeMax: now.toISOString(),
        maxResults: 100,
      });

      for (const event of response.events) {
        const organizer = event.organizer?.email || '';
        const organizerDomain = this.extractDomain(organizer);

        // Calculate duration
        const start = event.start?.dateTime
          ? new Date(event.start.dateTime)
          : null;
        const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
        const duration =
          start && end ? (end.getTime() - start.getTime()) / (1000 * 60) : 0;

        // Get user's response status
        const userResponse = event.attendees?.find((a) =>
          a.self
        )?.responseStatus;

        patterns.push({
          organizer,
          organizerDomain,
          title: event.summary || '',
          attendeeCount: event.attendees?.length || 0,
          wasAccepted: userResponse === 'accepted',
          wasDeclined: userResponse === 'declined',
          wasTentative: userResponse === 'tentative',
          duration,
        });
      }
    } catch (error) {
      context.log('Error collecting calendar patterns', {
        error: String(error),
      });
    }

    return patterns;
  }

  /**
   * Infer email automation rules from patterns
   */
  private inferEmailRules(
    patterns: EmailActionPattern[],
    minSupport: number,
    minConfidence: number
  ): InferredRule[] {
    const rules: InferredRule[] = [];

    // Group patterns by domain
    const byDomain = this.groupBy(patterns, (p) => p.fromDomain);

    for (const [domain, domainPatterns] of Object.entries(byDomain)) {
      if (domainPatterns.length < minSupport) continue;

      // Check for archive pattern
      const archivedCount = domainPatterns.filter((p) => p.wasArchived).length;
      const archiveRate = archivedCount / domainPatterns.length;

      if (archiveRate >= minConfidence) {
        rules.push({
          id: `email-archive-${domain}-${Date.now()}`,
          patternType: 'email_archive',
          trigger: {
            type: 'email',
            conditions: {
              fromDomain: domain,
            },
          },
          action: {
            type: 'archive',
            parameters: {},
          },
          confidence: archiveRate,
          confidenceLevel: this.getConfidenceLevel(archiveRate),
          supportingEvidence: archivedCount,
          suggestedAt: new Date(),
          description: `Archive emails from ${domain} (${Math.round(archiveRate * 100)}% archived historically)`,
        });
      }
    }

    // Group by sender for label patterns
    const bySender = this.groupBy(patterns, (p) => p.from);

    for (const [sender, senderPatterns] of Object.entries(bySender)) {
      if (senderPatterns.length < minSupport) continue;

      // Find common labels
      const labelCounts = new Map<string, number>();
      for (const pattern of senderPatterns) {
        for (const label of pattern.labels) {
          // Skip system labels
          if (['INBOX', 'SENT', 'TRASH', 'SPAM', 'UNREAD'].includes(label)) {
            continue;
          }
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        }
      }

      // Check if any label is consistently applied
      for (const [label, count] of labelCounts) {
        const labelRate = count / senderPatterns.length;

        if (labelRate >= minConfidence && count >= minSupport) {
          rules.push({
            id: `email-label-${sender}-${label}-${Date.now()}`,
            patternType: 'email_label',
            trigger: {
              type: 'email',
              conditions: {
                from: sender,
              },
            },
            action: {
              type: 'applyLabel',
              parameters: { label },
            },
            confidence: labelRate,
            confidenceLevel: this.getConfidenceLevel(labelRate),
            supportingEvidence: count,
            suggestedAt: new Date(),
            description: `Apply label "${label}" to emails from ${sender}`,
          });
        }
      }
    }

    return rules;
  }

  /**
   * Infer calendar automation rules from patterns
   */
  private inferCalendarRules(
    patterns: CalendarActionPattern[],
    minSupport: number,
    minConfidence: number
  ): InferredRule[] {
    const rules: InferredRule[] = [];

    // Group by organizer domain
    const byDomain = this.groupBy(patterns, (p) => p.organizerDomain);

    for (const [domain, domainPatterns] of Object.entries(byDomain)) {
      if (domainPatterns.length < minSupport) continue;

      // Check for accept pattern
      const acceptedCount = domainPatterns.filter((p) => p.wasAccepted).length;
      const acceptRate = acceptedCount / domainPatterns.length;

      if (acceptRate >= minConfidence) {
        rules.push({
          id: `calendar-accept-${domain}-${Date.now()}`,
          patternType: 'calendar_accept',
          trigger: {
            type: 'calendar',
            conditions: {
              organizerDomain: domain,
            },
          },
          action: {
            type: 'accept',
            parameters: {},
          },
          confidence: acceptRate,
          confidenceLevel: this.getConfidenceLevel(acceptRate),
          supportingEvidence: acceptedCount,
          suggestedAt: new Date(),
          description: `Auto-accept meeting invites from ${domain} (${Math.round(acceptRate * 100)}% accepted historically)`,
        });
      }

      // Check for decline pattern
      const declinedCount = domainPatterns.filter((p) => p.wasDeclined).length;
      const declineRate = declinedCount / domainPatterns.length;

      if (declineRate >= minConfidence) {
        rules.push({
          id: `calendar-decline-${domain}-${Date.now()}`,
          patternType: 'calendar_decline',
          trigger: {
            type: 'calendar',
            conditions: {
              organizerDomain: domain,
            },
          },
          action: {
            type: 'decline',
            parameters: {},
          },
          confidence: declineRate,
          confidenceLevel: this.getConfidenceLevel(declineRate),
          supportingEvidence: declinedCount,
          suggestedAt: new Date(),
          description: `Auto-decline meeting invites from ${domain} (${Math.round(declineRate * 100)}% declined historically)`,
        });
      }
    }

    // Check for patterns based on meeting size
    const smallMeetings = patterns.filter((p) => p.attendeeCount <= 3);
    const largeMeetings = patterns.filter((p) => p.attendeeCount > 10);

    if (smallMeetings.length >= minSupport) {
      const acceptRate =
        smallMeetings.filter((p) => p.wasAccepted).length / smallMeetings.length;

      if (acceptRate >= minConfidence) {
        rules.push({
          id: `calendar-accept-small-${Date.now()}`,
          patternType: 'calendar_accept',
          trigger: {
            type: 'calendar',
            conditions: {
              attendeeCount: ['<=', '3'],
            },
          },
          action: {
            type: 'accept',
            parameters: {},
          },
          confidence: acceptRate,
          confidenceLevel: this.getConfidenceLevel(acceptRate),
          supportingEvidence: smallMeetings.filter((p) => p.wasAccepted).length,
          suggestedAt: new Date(),
          description: `Auto-accept small meetings (3 or fewer attendees)`,
        });
      }
    }

    if (largeMeetings.length >= minSupport) {
      const declineRate =
        largeMeetings.filter((p) => p.wasDeclined).length / largeMeetings.length;

      if (declineRate >= minConfidence) {
        rules.push({
          id: `calendar-decline-large-${Date.now()}`,
          patternType: 'calendar_decline',
          trigger: {
            type: 'calendar',
            conditions: {
              attendeeCount: ['>', '10'],
            },
          },
          action: {
            type: 'decline',
            parameters: { suggestAlternative: true },
          },
          confidence: declineRate,
          confidenceLevel: this.getConfidenceLevel(declineRate),
          supportingEvidence: largeMeetings.filter((p) => p.wasDeclined).length,
          suggestedAt: new Date(),
          description: `Auto-decline large meetings (more than 10 attendees)`,
        });
      }
    }

    return rules;
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Group array by key function
   */
  private groupBy<T>(
    items: T[],
    keyFn: (item: T) => string
  ): Record<string, T[]> {
    return items.reduce(
      (acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(item);
        return acc;
      },
      {} as Record<string, T[]>
    );
  }

  /**
   * Get confidence level from numeric confidence
   */
  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.75) return 'medium';
    return 'low';
  }

  async onComplete(output: MLRuleInferrerOutput, context: AgentContext): Promise<void> {
    context.log('ML rule inference completed', {
      rulesInferred: output.rulesInferred,
      patternsAnalyzed: output.patternsAnalyzed,
      processingTimeMs: output.processingTime,
    });

    // Emit event for UI notification
    if (output.rulesInferred > 0) {
      await context.emit('izzie/rules.inferred', {
        userId: context.userId,
        count: output.rulesInferred,
        breakdown: output.patternBreakdown,
        rules: output.rules.map((r) => ({
          id: r.id,
          type: r.patternType,
          confidence: r.confidence,
          description: r.description,
        })),
      });
    }
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    context.log('ML rule inference failed', { error: error.message });
  }
}

export const mlRuleInferrerAgent = new MLRuleInferrerAgent();
registerAgent(mlRuleInferrerAgent);
export const mlRuleInferrerFunction = createAgentFunction(mlRuleInferrerAgent);
