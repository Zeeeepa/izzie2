/**
 * Entity Discoverer Agent
 * Discovers entities (people, companies, projects) from emails and calendar events
 *
 * Part of the 5 Proactive Long-Running Background Agents (#89)
 */

import { BaseAgent, createAgentFunction } from '../framework';
import { registerAgent } from '../registry';
import type { AgentConfig, AgentContext, AgentSource } from '../types';
import { getRecentEmails } from '@/lib/chat/email-retrieval';
import { listEvents } from '@/lib/calendar';
import { listEntitiesByType, getEntityStats } from '@/lib/weaviate/entities';
import type { EntityType } from '@/lib/extraction/types';

interface EntityDiscovererInput {
  userId: string;
  sources?: AgentSource[];
  daysToProcess?: number;
}

interface EntityDiscovererOutput {
  entitiesFound: number;
  emailsProcessed: number;
  eventsProcessed: number;
  entityBreakdown: Record<string, number>;
}

/**
 * Entity Discoverer Agent
 *
 * This agent runs in the background to scan emails and calendar events,
 * tracking processing progress through cursors for incremental updates.
 *
 * Entity extraction is handled by separate Inngest functions (extract-entities),
 * so this agent primarily:
 * 1. Tracks what has been processed
 * 2. Reports on entity discovery metrics
 * 3. Triggers extraction for unprocessed content
 */
class EntityDiscovererAgent extends BaseAgent<EntityDiscovererInput, EntityDiscovererOutput> {
  name = 'entity-discoverer';
  version = '1.0.0';
  description = 'Discovers entities (people, companies, projects) from emails and calendar';

  config: AgentConfig = {
    trigger: 'izzie/agent.entity-discoverer',
    maxConcurrency: 1,
    retries: 3,
    timeout: 300000, // 5 minutes
  };

  sources: AgentSource[] = ['email', 'calendar'];

  async execute(
    input: EntityDiscovererInput,
    context: AgentContext
  ): Promise<EntityDiscovererOutput> {
    const { userId, daysToProcess = 7 } = input;
    let entitiesFound = 0;
    let emailsProcessed = 0;
    let eventsProcessed = 0;
    const entityBreakdown: Record<string, number> = {};

    // Get cursor for email processing
    const emailCursor = await this.getCursor(userId, 'email');
    const calendarCursor = await this.getCursor(userId, 'calendar');

    const startDate =
      emailCursor?.lastProcessedDate ||
      new Date(Date.now() - daysToProcess * 24 * 60 * 60 * 1000);

    context.log('Starting entity discovery', {
      startDate: startDate.toISOString(),
      daysToProcess,
      hasEmailCursor: !!emailCursor,
      hasCalendarCursor: !!calendarCursor,
    });

    // Process emails
    try {
      const emails = await getRecentEmails(userId, {
        maxResults: 50,
        hoursBack: daysToProcess * 24,
      });

      emailsProcessed = emails.length;
      context.log(`Found ${emailsProcessed} recent emails to process`);

      // Entity extraction is already integrated via Inngest events
      // This agent tracks what's been processed and emits events if needed
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];

        // Emit extraction event for any new emails
        await context.emit('izzie/email.received', {
          userId,
          emailId: email.id,
          subject: email.subject,
          from: email.from,
        });

        // Update progress
        const emailProgress = Math.floor(((i + 1) / emails.length) * 40);
        await context.trackProgress(emailProgress, i + 1);
      }

      // Update email cursor
      await this.saveCursor(userId, 'email', {
        lastProcessedDate: new Date(),
        checkpoint: { emailsProcessed },
      });
    } catch (error) {
      context.log('Error fetching emails', { error: String(error) });
    }

    // Process calendar events
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - daysToProcess * 24 * 60 * 60 * 1000);

      const calendarResponse = await listEvents(userId, {
        timeMin: weekAgo.toISOString(),
        timeMax: now.toISOString(),
        maxResults: 50,
      });

      eventsProcessed = calendarResponse.events.length;
      context.log(`Found ${eventsProcessed} calendar events to process`);

      // Emit extraction events for calendar events
      for (let i = 0; i < calendarResponse.events.length; i++) {
        const event = calendarResponse.events[i];

        await context.emit('izzie/calendar.event.created', {
          userId,
          eventId: event.id,
          summary: event.summary,
          attendees: event.attendees?.map((a) => a.email) || [],
        });

        // Update progress (40-80% range)
        const eventProgress = 40 + Math.floor(((i + 1) / calendarResponse.events.length) * 40);
        await context.trackProgress(eventProgress, emailsProcessed + i + 1);
      }

      // Update calendar cursor
      await this.saveCursor(userId, 'calendar', {
        lastProcessedDate: new Date(),
        checkpoint: { eventsProcessed },
      });
    } catch (error) {
      context.log('Error fetching calendar', { error: String(error) });
    }

    // Get entity statistics
    try {
      const stats = await getEntityStats(userId);

      const entityTypes: EntityType[] = [
        'person',
        'company',
        'project',
        'date',
        'topic',
        'location',
        'action_item',
      ];

      for (const entityType of entityTypes) {
        const count = stats[entityType] || 0;
        entityBreakdown[entityType] = count;
        entitiesFound += count;
      }

      context.log('Entity statistics retrieved', { entityBreakdown });
    } catch (error) {
      context.log('Error getting entity stats', { error: String(error) });
    }

    await context.trackProgress(100, emailsProcessed + eventsProcessed);

    return {
      entitiesFound,
      emailsProcessed,
      eventsProcessed,
      entityBreakdown,
    };
  }

  async onComplete(output: EntityDiscovererOutput, context: AgentContext): Promise<void> {
    context.log('Entity discovery completed', {
      entitiesFound: output.entitiesFound,
      emailsProcessed: output.emailsProcessed,
      eventsProcessed: output.eventsProcessed,
    });
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    context.log('Entity discovery failed', { error: error.message });
  }
}

export const entityDiscovererAgent = new EntityDiscovererAgent();
registerAgent(entityDiscovererAgent);
export const entityDiscovererFunction = createAgentFunction(entityDiscovererAgent);
