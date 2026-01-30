/**
 * Relationship Discovery Scheduled Function
 * Runs daily at 3 AM (after drive extraction at 2 AM) to discover relationships
 * between entities across all data sources.
 *
 * Can also be triggered by the 'izzie/graph.updated' event when significant
 * entities are added to the graph.
 */

import { inngest } from '../index';

const LOG_PREFIX = '[DiscoverRelationships]';

// Minimum number of new entities to trigger relationship discovery
const MIN_ENTITIES_FOR_DISCOVERY = 5;

/**
 * Scheduled relationship discovery function
 * Runs daily at 3 AM to analyze entities and infer relationships
 */
export const discoverRelationshipsScheduled = inngest.createFunction(
  {
    id: 'discover-relationships-scheduled',
    name: 'Discover Relationships (Scheduled)',
    retries: 3,
    concurrency: {
      limit: 1, // Only run one instance at a time
    },
  },
  { cron: '0 3 * * *' }, // Run daily at 3 AM (after drive extraction at 2 AM)
  async ({ step }) => {
    const userId = process.env.DEFAULT_USER_ID || 'default';

    console.log(`${LOG_PREFIX} Starting scheduled relationship discovery for user ${userId}`);

    // Step 1: Trigger the relationship discoverer agent
    const result = await step.run('trigger-relationship-discoverer', async () => {
      console.log(`${LOG_PREFIX} Triggering relationship discoverer agent`);

      // Emit event to trigger the relationship discoverer agent
      await inngest.send({
        name: 'izzie/agent.relationship-discoverer',
        data: {
          userId,
          batchSize: 100, // Process more entities in scheduled run
          minConfidence: 0.6,
        },
      });

      return {
        triggered: true,
        triggeredAt: new Date().toISOString(),
      };
    });

    console.log(`${LOG_PREFIX} Relationship discovery triggered`, result);

    return {
      userId,
      scheduled: true,
      ...result,
      completedAt: new Date().toISOString(),
    };
  }
);

/**
 * Event-triggered relationship discovery function
 * Runs when the graph is updated with significant new entities
 */
export const discoverRelationshipsOnGraphUpdate = inngest.createFunction(
  {
    id: 'discover-relationships-on-graph-update',
    name: 'Discover Relationships (On Graph Update)',
    retries: 3,
    concurrency: {
      limit: 2, // Allow a couple concurrent runs for different sources
    },
    // Debounce to avoid running for every single entity extraction
    debounce: {
      key: 'event.data.userId',
      period: '5m', // Wait 5 minutes after last event before running
    },
  },
  { event: 'izzie/graph.updated' },
  async ({ event, step }) => {
    const { userId, entitiesCount, sourceType } = event.data;

    console.log(
      `${LOG_PREFIX} Graph updated with ${entitiesCount} entities from ${sourceType}`
    );

    // Skip if not enough entities to warrant relationship discovery
    if (entitiesCount < MIN_ENTITIES_FOR_DISCOVERY) {
      console.log(
        `${LOG_PREFIX} Skipping - only ${entitiesCount} entities (minimum: ${MIN_ENTITIES_FOR_DISCOVERY})`
      );
      return {
        userId,
        skipped: true,
        reason: 'Not enough entities',
        entitiesCount,
        minRequired: MIN_ENTITIES_FOR_DISCOVERY,
      };
    }

    // Trigger the relationship discoverer agent
    const result = await step.run('trigger-relationship-discoverer', async () => {
      console.log(`${LOG_PREFIX} Triggering relationship discoverer agent for ${sourceType}`);

      await inngest.send({
        name: 'izzie/agent.relationship-discoverer',
        data: {
          userId,
          batchSize: 50, // Smaller batch for event-triggered runs
          minConfidence: 0.6,
        },
      });

      return {
        triggered: true,
        triggeredAt: new Date().toISOString(),
      };
    });

    console.log(`${LOG_PREFIX} Relationship discovery triggered`, result);

    return {
      userId,
      sourceType,
      entitiesCount,
      ...result,
      completedAt: new Date().toISOString(),
    };
  }
);
