/**
 * Weaviate Schema Definitions
 *
 * Defines collections for extracted entities and memories:
 * - Person, Company, Project, Date, Topic, Location, ActionItem
 * - Memory (with temporal decay)
 */

import { getWeaviateClient } from './client';
import type { EntityType } from '../extraction/types';
import { initializeMemorySchema } from '../memory/storage';
import { initResearchFindingSchema } from './research-findings';

const LOG_PREFIX = '[Weaviate Schema]';

/**
 * Collection names mapped to entity types
 */
export const COLLECTIONS: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  project: 'Project',
  date: 'Date',
  topic: 'Topic',
  location: 'Location',
  action_item: 'ActionItem',
};

/**
 * Relationship collection name
 */
export const RELATIONSHIP_COLLECTION = 'Relationship';

/**
 * Common properties for all entity collections
 */
interface BaseEntityProperties {
  value: string; // Original entity value
  normalized: string; // Normalized form
  confidence: number; // 0-1 confidence score
  source: string; // metadata, body, or subject
  sourceId: string; // Email/event ID
  userId: string; // User who owns this entity
  extractedAt: string; // ISO timestamp
  context?: string; // Optional surrounding text
}

/**
 * Action item specific properties
 */
interface ActionItemProperties extends BaseEntityProperties {
  assignee?: string;
  deadline?: string;
  priority?: string;
}

/**
 * Create all entity collections if they don't exist
 */
export async function initializeSchema(): Promise<void> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Initializing schema...`);

  // Define collections for each entity type
  const collectionDefinitions = [
    {
      name: COLLECTIONS.person,
      description: 'Person entities extracted from emails and calendar events',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original person name' },
        { name: 'normalized', dataType: 'text', description: 'Normalized person name' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      ],
    },
    {
      name: COLLECTIONS.company,
      description: 'Company/organization entities',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original company name' },
        { name: 'normalized', dataType: 'text', description: 'Normalized company name' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      ],
    },
    {
      name: COLLECTIONS.project,
      description: 'Project entities',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original project name' },
        { name: 'normalized', dataType: 'text', description: 'Normalized project name' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      ],
    },
    {
      name: COLLECTIONS.date,
      description: 'Date/deadline entities',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original date value' },
        { name: 'normalized', dataType: 'text', description: 'Normalized date (ISO format)' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      ],
    },
    {
      name: COLLECTIONS.topic,
      description: 'Topic/subject entities',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original topic' },
        { name: 'normalized', dataType: 'text', description: 'Normalized topic' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      ],
    },
    {
      name: COLLECTIONS.location,
      description: 'Location entities',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original location' },
        { name: 'normalized', dataType: 'text', description: 'Normalized location' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      ],
    },
    {
      name: COLLECTIONS.action_item,
      description: 'Action item entities with assignee and deadline',
      properties: [
        { name: 'value', dataType: 'text', description: 'Original action item text' },
        { name: 'normalized', dataType: 'text', description: 'Normalized action item' },
        { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
        { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
        { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
        { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
        { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
        { name: 'context', dataType: 'text', description: 'Surrounding text context' },
        { name: 'assignee', dataType: 'text', description: 'Person assigned to action item' },
        { name: 'deadline', dataType: 'text', description: 'Deadline for action item' },
        { name: 'priority', dataType: 'text', description: 'Priority: low, medium, high' },
      ],
    },
  ];

  // Create each collection if it doesn't exist
  for (const definition of collectionDefinitions) {
    try {
      // Check if collection exists
      const exists = await client.collections.exists(definition.name);

      if (exists) {
        console.log(`${LOG_PREFIX} Collection '${definition.name}' already exists`);
        continue;
      }

      // Create collection
      await client.collections.create({
        name: definition.name,
        description: definition.description,
        properties: definition.properties as any,
      });

      console.log(`${LOG_PREFIX} Created collection '${definition.name}'`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to create collection '${definition.name}':`, error);
      throw error;
    }
  }

  // Initialize Relationship collection
  try {
    const relationshipExists = await client.collections.exists(RELATIONSHIP_COLLECTION);

    if (relationshipExists) {
      console.log(`${LOG_PREFIX} Collection '${RELATIONSHIP_COLLECTION}' already exists`);
    } else {
      await client.collections.create({
        name: RELATIONSHIP_COLLECTION,
        description: 'Inferred relationships between entities',
        properties: [
          { name: 'fromEntityType', dataType: 'text', description: 'Source entity type' },
          { name: 'fromEntityValue', dataType: 'text', description: 'Source entity normalized value' },
          { name: 'toEntityType', dataType: 'text', description: 'Target entity type' },
          { name: 'toEntityValue', dataType: 'text', description: 'Target entity normalized value' },
          { name: 'relationshipType', dataType: 'text', description: 'Type of relationship (WORKS_WITH, etc.)' },
          { name: 'confidence', dataType: 'number', description: 'Confidence score (0-1)' },
          { name: 'evidence', dataType: 'text', description: 'Evidence/context for relationship' },
          { name: 'sourceId', dataType: 'text', description: 'Source email/event ID' },
          { name: 'userId', dataType: 'text', description: 'User ID who owns this relationship' },
          { name: 'inferredAt', dataType: 'text', description: 'ISO timestamp of inference' },
        ] as any,
      });

      console.log(`${LOG_PREFIX} Created collection '${RELATIONSHIP_COLLECTION}'`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create collection '${RELATIONSHIP_COLLECTION}':`, error);
    throw error;
  }

  // Initialize Memory collection
  await initializeMemorySchema();

  // Initialize ResearchFinding collection
  await initResearchFindingSchema();

  console.log(`${LOG_PREFIX} Schema initialization complete`);
}

/**
 * Delete all entity collections (use with caution!)
 */
export async function deleteAllCollections(): Promise<void> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Deleting all collections...`);

  // Delete entity collections
  for (const collectionName of Object.values(COLLECTIONS)) {
    try {
      const exists = await client.collections.exists(collectionName);
      if (exists) {
        await client.collections.delete(collectionName);
        console.log(`${LOG_PREFIX} Deleted collection '${collectionName}'`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to delete collection '${collectionName}':`, error);
    }
  }

  // Delete relationship collection
  try {
    const exists = await client.collections.exists(RELATIONSHIP_COLLECTION);
    if (exists) {
      await client.collections.delete(RELATIONSHIP_COLLECTION);
      console.log(`${LOG_PREFIX} Deleted collection '${RELATIONSHIP_COLLECTION}'`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete collection '${RELATIONSHIP_COLLECTION}':`, error);
  }

  console.log(`${LOG_PREFIX} All collections deleted`);
}
