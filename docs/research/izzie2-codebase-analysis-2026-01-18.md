# Izzie2 Codebase Analysis: Weaviate, Entities, AI, and Graph Integration

**Research Date:** 2026-01-18
**Purpose:** Understand current Weaviate schema, entity storage, extraction types, OpenRouter AI client configuration, and existing graph/relationship patterns
**Status:** Complete

---

## Executive Summary

Izzie2 is an email intelligence platform that extracts structured entities from emails and calendar events using AI (via OpenRouter), stores them in Weaviate Cloud for vector search, and builds a Neo4j knowledge graph for relationship queries. The system uses a three-tier AI model strategy (cheap → standard → premium) with comprehensive entity extraction, deduplication, and graph traversal capabilities.

**Key Components:**
1. **Weaviate Collections**: 7 entity types (Person, Company, Project, Date, Topic, Location, ActionItem) + Memory
2. **AI Client**: OpenRouter with tiered model routing (Mistral Small, Claude Sonnet 4, Claude Opus 4)
3. **Entity Extraction**: LLM-based extraction with confidence scoring, spam detection, and user identity awareness
4. **Neo4j Graph**: Entity relationship graph with 7 relationship types for knowledge discovery

---

## 1. Weaviate Schema: Entity Collections

**Location:** `/src/lib/weaviate/schema.ts`

### Collection Mapping

```typescript
export const COLLECTIONS: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  project: 'Project',
  date: 'Date',
  topic: 'Topic',
  location: 'Location',
  action_item: 'ActionItem',
};
```

### Base Entity Properties (All Collections)

Every entity collection shares these core properties:

```typescript
interface BaseEntityProperties {
  value: string;          // Original entity value (e.g., "John Doe")
  normalized: string;     // Normalized form (e.g., "john_doe")
  confidence: number;     // 0-1 confidence score from AI extraction
  source: string;         // "metadata", "body", or "subject"
  sourceId: string;       // Email/event ID that entity was extracted from
  userId: string;         // User who owns this entity
  extractedAt: string;    // ISO timestamp of extraction
  context?: string;       // Optional surrounding text for context
}
```

### ActionItem Special Properties

ActionItem collection extends base properties with task-specific fields:

```typescript
interface ActionItemProperties extends BaseEntityProperties {
  assignee?: string;   // Person assigned to action item
  deadline?: string;   // Deadline for action item
  priority?: string;   // "low", "medium", "high"
}
```

### Memory Collection

In addition to entity collections, the schema initializes a **Memory** collection via `initializeMemorySchema()` for temporal decay-based memory storage (managed separately in `src/lib/memory/storage`).

### Schema Initialization

```typescript
// Creates all collections if they don't exist
await initializeSchema();

// Gracefully handles existing collections (idempotent)
// Creates indexes for performance
// Initializes Memory collection for temporal storage
```

---

## 2. Entity Storage: Weaviate Operations

**Location:** `/src/lib/weaviate/entities.ts`

### Save Entities

```typescript
/**
 * Batch insert entities grouped by type
 * @param entities - Array of extracted entities
 * @param userId - User ID who owns these entities
 * @param sourceId - Email or event ID
 */
await saveEntities(entities, userId, sourceId);

// Example usage:
const entities: Entity[] = [
  { type: 'person', value: 'John Doe', normalized: 'john_doe', confidence: 0.95, source: 'metadata' },
  { type: 'company', value: 'Acme Corp', normalized: 'acme_corp', confidence: 0.90, source: 'body' }
];
await saveEntities(entities, 'user-123', 'email-456');
```

**Implementation Details:**
- Groups entities by type for efficient batch insertion
- Uses `collection.data.insertMany()` for batch operations
- Tracks insertion counts per entity type
- Automatically adds action item specific fields when type is `action_item`

### Search Entities

```typescript
/**
 * BM25 keyword search across collections (no vectorizer needed)
 * @param query - Search query text
 * @param userId - Filter by user ID
 * @param options - Entity type filter, limit, confidence threshold
 */
const results = await searchEntities('John Doe', 'user-123', {
  entityType: 'person',  // Optional: filter by type
  limit: 20,             // Default: 20
  minConfidence: 0.8     // Optional: filter by confidence
});

// Returns deduplicated entities sorted by confidence
```

**Implementation Details:**
- Uses Weaviate BM25 search (no vector embeddings required)
- Searches across all collections or filtered by `entityType`
- Client-side filtering by `userId` (Weaviate limitation)
- Deduplicates by `type:normalized` key, keeping highest confidence

### Get Entities by Source

```typescript
/**
 * Fetch all entities from a specific email/event
 */
const entities = await getEntitiesBySource('email-456', 'user-123');

// Returns all entity types for that source
// Useful for showing "entities extracted from this email"
```

### Delete Entities by Source

```typescript
/**
 * Delete all entities extracted from a specific source
 * Useful for re-extraction or cleanup
 */
const deletedCount = await deleteEntitiesBySource('email-456', 'user-123');
```

### Entity Statistics

```typescript
/**
 * Get entity count breakdown by type
 */
const stats = await getEntityStats('user-123');
// {
//   person: 450,
//   company: 123,
//   project: 67,
//   date: 234,
//   topic: 189,
//   location: 45,
//   action_item: 78
// }
```

### List Entities by Type

```typescript
/**
 * List all entities of a specific type
 * @param userId - Optional user filter (omit for single-user apps)
 * @param entityType - Entity type to list
 * @param limit - Max results (default: 500)
 */
const people = await listEntitiesByType('user-123', 'person', 500);

// Returns entities with sourceId and extractedAt for traceability
```

---

## 3. Entity Extraction Types

**Location:** `/src/lib/extraction/types.ts`

### Core Entity Interface

```typescript
export interface Entity {
  type: EntityType;                      // 'person' | 'company' | 'project' | ...
  value: string;                         // Original text (e.g., "Bob")
  normalized: string;                    // Normalized form (e.g., "Robert Smith")
  confidence: number;                    // 0-1 confidence score
  source: 'metadata' | 'body' | 'subject'; // Where entity was found
  context?: string;                      // Surrounding text

  // Action item specific fields (when type === 'action_item')
  assignee?: string;                     // Who should do it
  deadline?: string;                     // When it's due
  priority?: 'low' | 'medium' | 'high';  // Priority level
}
```

### Entity Types

```typescript
export type EntityType =
  | 'person'       // Names of people
  | 'company'      // Organizations
  | 'project'      // Project/initiative names
  | 'date'         // Dates and deadlines
  | 'topic'        // Discussion topics
  | 'location'     // Places
  | 'action_item'; // Tasks with assignees/deadlines
```

### Extraction Result

```typescript
export interface ExtractionResult {
  emailId: string;                // Gmail message ID
  entities: Entity[];             // Extracted entities
  spam: SpamClassification;       // Spam detection result
  extractedAt: Date;              // Extraction timestamp
  cost: number;                   // API cost in USD
  model: string;                  // Model used (e.g., "mistralai/mistral-small-3.2-24b-instruct")
}

export interface SpamClassification {
  isSpam: boolean;                // Is this spam/promotional/low-value?
  spamScore: number;              // 0-1 confidence
  spamReason?: string;            // Why it's spam
}
```

### Calendar Extraction Result

```typescript
export interface CalendarExtractionResult {
  eventId: string;                // Calendar event ID
  entities: Entity[];             // Extracted entities
  spam: SpamClassification;       // Always false for calendar events
  extractedAt: Date;
  cost: number;
  model: string;
}
```

### Extraction Configuration

```typescript
export interface ExtractionConfig {
  minConfidence: number;          // Minimum confidence threshold (default: 0.7)
  extractFromMetadata: boolean;   // Extract from To/From/CC (default: true)
  extractFromSubject: boolean;    // Extract from subject line (default: true)
  extractFromBody: boolean;       // Extract from email body (default: true)
  normalizeEntities: boolean;     // Normalize entity names (default: true)
}

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minConfidence: 0.7,
  extractFromMetadata: true,
  extractFromSubject: true,
  extractFromBody: true,
  normalizeEntities: true,
};
```

### Batch Statistics

```typescript
export interface ExtractionStats {
  totalEmails: number;
  successCount: number;
  failureCount: number;
  totalEntities: number;
  totalCost: number;              // Total cost in USD
  processingTimeMs: number;
  entitiesPerEmail: number;       // Average
  costPerEmail: number;           // Average
}
```

---

## 4. OpenRouter AI Client Configuration

**Location:** `/src/lib/ai/client.ts`, `/src/lib/ai/models.ts`

### Model Tier Strategy

Izzie2 uses a **three-tier model routing** strategy for cost optimization:

```typescript
export const MODELS = {
  // CHEAP tier - Fast, simple tasks (classification, routing)
  CLASSIFIER: 'mistralai/mistral-small-3.2-24b-instruct',
  SCHEDULER: 'mistralai/mistral-small-3.2-24b-instruct',

  // STANDARD tier - General purpose tasks
  GENERAL: 'anthropic/claude-sonnet-4',

  // PREMIUM tier - Complex reasoning and orchestration
  ORCHESTRATOR: 'anthropic/claude-opus-4',
} as const;
```

### Model Costs (per 1K tokens)

```typescript
export const MODEL_COSTS = {
  'mistralai/mistral-small-3.2-24b-instruct': {
    input: 0.0001,   // $0.0001 per 1K input tokens
    output: 0.0003   // $0.0003 per 1K output tokens
  },
  'anthropic/claude-sonnet-4': {
    input: 0.003,    // $0.003 per 1K input tokens
    output: 0.015    // $0.015 per 1K output tokens
  },
  'anthropic/claude-opus-4': {
    input: 0.015,    // $0.015 per 1K input tokens
    output: 0.075    // $0.075 per 1K output tokens
  },
} as const;
```

### OpenRouterClient Usage

```typescript
import { getAIClient } from '@/lib/ai';

const client = getAIClient();

// Basic chat completion
const response = await client.chat(
  [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' }
  ],
  {
    model: MODELS.GENERAL,       // Choose model tier
    maxTokens: 1000,             // Token limit
    temperature: 0.7,            // Creativity (0-1)
    logCost: true                // Log cost to console
  }
);

console.log(response.content);
console.log(`Cost: $${response.usage.cost.toFixed(6)}`);
```

### Entity Extraction LLM Usage

```typescript
// From src/lib/extraction/entity-extractor.ts

const response = await this.client.chat(
  [
    {
      role: 'system',
      content: 'You are an expert entity extraction system. Extract structured information from emails and respond with valid JSON only.',
    },
    { role: 'user', content: prompt },
  ],
  {
    model: MODELS.CLASSIFIER,  // Uses cheap Mistral Small tier
    maxTokens: 1000,
    temperature: 0.1,          // Low temperature for consistent extraction
    logCost: false,
  }
);

// Parse JSON response
const parsed = this.parseExtractionResponse(response.content);
```

### Streaming Chat

```typescript
// For real-time chat responses
for await (const chunk of client.streamChat(messages, options)) {
  console.log(chunk.delta);    // Incremental text
  console.log(chunk.content);  // Full content so far
  console.log(chunk.done);     // Is completion finished?
}
```

### Classification Helper

```typescript
// Quick classification using cheap model
const result = await client.classify(
  'This is a promotional email about discounts',
  ['spam', 'important', 'promotional', 'personal']
);

console.log(result.category);    // "promotional"
console.log(result.confidence);  // 1.0
console.log(result.cost);        // ~$0.00003
```

### Model Escalation

```typescript
// Automatically escalate to higher tier if task is too complex
const betterResponse = await client.escalate(
  'complex-task',
  messages,
  MODELS.CLASSIFIER,  // From cheap tier
  'Initial response was too simple'
);
// Automatically uses MODELS.GENERAL (next tier up)
```

### Usage Tracking

```typescript
// Track costs across all requests
const stats = client.getUsageStats();
console.log(stats);
// Map {
//   'mistralai/mistral-small-3.2-24b-instruct' => {
//     model: 'mistralai/mistral-small-3.2-24b-instruct',
//     requestCount: 245,
//     totalPromptTokens: 123456,
//     totalCompletionTokens: 54321,
//     totalTokens: 177777,
//     totalCost: 0.0432
//   },
//   ...
// }

const totalCost = client.getTotalCost();  // $0.0432

// Reset tracking
client.resetUsageStats();
```

### Environment Configuration

```bash
# .env.local
OPENROUTER_API_KEY=sk-or-v1-xxxxx...
NEXT_PUBLIC_APP_URL=http://localhost:3000  # For HTTP-Referer header
```

### Convenience Functions

```typescript
// From src/lib/ai/index.ts

import { chat, streamChat, classify, getTotalCost } from '@/lib/ai';

// Use singleton client implicitly
const response = await chat(messages, options);
const stream = streamChat(messages, options);
const category = await classify(text, categories);
const cost = getTotalCost();
```

---

## 5. Existing Graph/Relationship Functionality

**Location:** `/src/lib/graph/`

### Neo4j Knowledge Graph Architecture

Izzie2 has a **fully-implemented Neo4j graph** for entity relationships. This is separate from Weaviate and provides graph traversal, relationship discovery, and co-occurrence analysis.

### Graph Node Types

```typescript
export type NodeLabel =
  | 'Person'      // People mentioned in emails
  | 'Company'     // Organizations
  | 'Project'     // Projects/initiatives
  | 'Topic'       // Discussion topics
  | 'Location'    // Places
  | 'Email'       // Email messages
  | 'Document';   // Future: Drive documents
```

### Graph Relationship Types

```typescript
export type RelationshipType =
  | 'MENTIONED_IN'      // Entity → Email (confidence, source, context)
  | 'WORKS_WITH'        // Person → Person (co-occurrence weight)
  | 'DISCUSSED_TOPIC'   // Person → Topic (frequency)
  | 'COLLABORATES_ON'   // Person → Project (role, weight)
  | 'WORKS_FOR'         // Person → Company (current status)
  | 'RELATED_TO'        // Topic → Topic (co-occurrence)
  | 'LOCATED_AT';       // Entity → Location (weight)
```

### Node Properties

```typescript
// Base properties for entity nodes
export interface BaseNodeProperties {
  name: string;           // Original value
  normalized: string;     // Normalized key (e.g., "john_doe")
  frequency: number;      // How many times mentioned
  confidence: number;     // Average confidence score
  firstSeen: Date;        // First extraction timestamp
  lastSeen: Date;         // Last extraction timestamp
}

// Person-specific
export interface PersonNode extends BaseNodeProperties {
  email?: string;         // Email address if available
}

// Company-specific
export interface CompanyNode extends BaseNodeProperties {
  domain?: string;        // Company domain
}

// Email node
export interface EmailNode {
  id: string;             // Gmail message ID
  subject: string;
  timestamp: Date;
  significanceScore?: number;
  threadId?: string;
  from?: string;
  to?: string[];
  cc?: string[];
}
```

### Relationship Properties

```typescript
// Base relationship properties
export interface BaseRelationshipProperties {
  weight: number;         // Co-occurrence count or strength
  emailIds: string[];     // Which emails show this relationship
  firstSeen: Date;
  lastSeen: Date;
}

// COLLABORATES_ON specific
export interface CollaboratesOnRelationship extends BaseRelationshipProperties {
  role?: string;          // "lead", "contributor", "stakeholder"
}

// WORKS_FOR specific
export interface WorksForRelationship extends BaseRelationshipProperties {
  current?: boolean;      // Is this current employment?
}
```

### Building Graph from Extractions

```typescript
import { processExtraction, processBatch } from '@/lib/graph';

// Process single extraction
await processExtraction(extractionResult, {
  subject: 'Meeting Request',
  timestamp: new Date(),
  significanceScore: 0.8
});

// Process batch of extractions
await processBatch(extractionResults);

// Initialize graph (create indexes)
await initializeGraph();
```

### Querying the Graph

```typescript
import {
  getEntityByName,
  getWorksWith,
  getProjectCollaborators,
  getTopicExperts,
  searchEntities,
  getRelatedTopics,
  findPath
} from '@/lib/graph';

// Find person by normalized name
const person = await getEntityByName('john_doe', 'Person');

// Get people who work with John (co-occurrence)
const colleagues = await getWorksWith('john_doe', 10);
// Returns: [{ entity: PersonNode, weight: 15, emailIds: [...] }]

// Find project collaborators
const team = await getProjectCollaborators('project_apollo', 20);

// Find topic experts (who discusses this topic most)
const experts = await getTopicExperts('ai_research', 10);

// Get related topics (co-occurrence)
const related = await getRelatedTopics('ai_research', 10);

// Find shortest path between two entities
const path = await findPath('john_doe', 'acme_corp', 'Person', 'Company');
```

### Graph Statistics

```typescript
import { neo4jClient } from '@/lib/graph';

const stats = await neo4jClient.getStats();
// {
//   nodeCount: 1234,
//   relationshipCount: 5678,
//   nodesByType: {
//     Person: 450,
//     Company: 123,
//     Project: 67,
//     Topic: 189,
//     Location: 45,
//     Email: 360
//   },
//   relationshipsByType: {
//     WORKS_WITH: 890,
//     COLLABORATES_ON: 234,
//     MENTIONED_IN: 3456,
//     DISCUSSED_TOPIC: 567,
//     ...
//   }
// }
```

### Co-Occurrence Analysis

```typescript
import { buildCoOccurrences } from '@/lib/graph';

// Build co-occurrence relationships from extractions
// Creates WORKS_WITH, RELATED_TO, etc. based on entities appearing together
await buildCoOccurrences(extractionResults);
```

### Incremental Updates

The graph supports incremental updates without duplication:

```typescript
// Adding same entity twice increments frequency
await createEntityNode(entity, 'email-1'); // frequency: 1
await createEntityNode(entity, 'email-2'); // frequency: 2

// Relationships accumulate weight
await createCoOccurrence(person1, person2, 'email-1'); // weight: 1
await createCoOccurrence(person1, person2, 'email-2'); // weight: 2
```

### Neo4j Configuration

```bash
# .env.local
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxxxx
```

### Common Cypher Query Patterns

```cypher
-- Find people working on a project
MATCH (p:Person)-[c:COLLABORATES_ON]->(proj:Project {normalized: 'project_apollo'})
RETURN p.name, c.role, c.weight
ORDER BY c.weight DESC

-- Find related topics
MATCH (t1:Topic {normalized: 'ai_research'})-[r:RELATED_TO]-(t2:Topic)
RETURN t2.name, r.weight
ORDER BY r.weight DESC
LIMIT 10

-- Get email context
MATCH (entity)-[:MENTIONED_IN]->(e:Email {id: 'msg-123'})
RETURN labels(entity)[0] as type, entity.name
```

---

## 6. Integration Patterns: Weaviate + Neo4j

### Data Flow

```
Email/Event
    ↓
EntityExtractor (LLM via OpenRouter)
    ↓
ExtractionResult (entities + spam classification)
    ↓
    ├─→ Weaviate (saveEntities)          ← Vector/keyword search
    │   - BM25 search by keyword
    │   - No vector embeddings (yet)
    │   - User-scoped storage
    │
    └─→ Neo4j (processExtraction)        ← Graph traversal
        - Entity nodes (Person, Company, etc.)
        - Relationships (WORKS_WITH, COLLABORATES_ON, etc.)
        - Co-occurrence analysis
```

### When to Use Weaviate vs Neo4j

| Use Case | System | Why |
|----------|--------|-----|
| Search by keyword ("john doe") | Weaviate | BM25 keyword search, fast |
| Find who works with John | Neo4j | Graph traversal (WORKS_WITH relationships) |
| List all companies | Weaviate | `listEntitiesByType('company')` |
| Find project collaborators | Neo4j | `getProjectCollaborators()` |
| Get entities from an email | Weaviate | `getEntitiesBySource(emailId)` |
| Find shortest path between entities | Neo4j | `findPath()` with graph algorithms |
| Entity statistics | Both | Weaviate for counts, Neo4j for relationship stats |
| Co-occurrence analysis | Neo4j | Relationship weight tracking |

### Hybrid Query Pattern (Future Enhancement)

```typescript
// Conceptual example - not yet implemented
async function hybridSearch(query: string, userId: string) {
  // 1. Weaviate: Find entities matching query
  const weaviateResults = await searchEntities(query, userId, { limit: 10 });

  // 2. Neo4j: Expand with related entities
  const expandedResults = [];
  for (const entity of weaviateResults) {
    const related = await getRelatedEntities(entity.normalized, entity.type);
    expandedResults.push({ entity, related });
  }

  return expandedResults;
}
```

---

## 7. Key Implementation Patterns

### Entity Extraction Flow

1. **Email/Event Input** → `EntityExtractor.extractFromEmail()` or `extractFromCalendarEvent()`
2. **LLM Inference** → OpenRouter API with Mistral Small (cheap tier)
3. **JSON Parsing** → `parseExtractionResponse()` with error handling
4. **Confidence Filtering** → Filter by `minConfidence` threshold (default: 0.7)
5. **Deduplication** → Normalize entity names for consistent tracking
6. **Spam Detection** → Classify email as spam/promotional/important
7. **Batch Processing** → Process 10 emails at a time with progress logging

### Entity Storage Flow

1. **Group by Type** → Batch entities by type for efficient insertion
2. **Weaviate Insert** → `collection.data.insertMany()` per entity type
3. **Neo4j Insert** → `createEntityNode()` with MERGE pattern (upsert)
4. **Relationship Creation** → `buildCoOccurrences()` for entity pairs
5. **MENTIONED_IN Links** → Link entities to Email nodes

### Query Pattern

```typescript
// Weaviate: Keyword search
const people = await searchEntities('john', userId, { entityType: 'person' });

// Neo4j: Graph traversal
const colleagues = await getWorksWith(people[0].normalized, 10);

// Combined: Entity details + relationships
const fullProfile = {
  entity: people[0],
  worksWithPeople: colleagues,
  projects: await getEntityRelationships(people[0].normalized, 'COLLABORATES_ON'),
  topics: await getEntityRelationships(people[0].normalized, 'DISCUSSED_TOPIC')
};
```

---

## 8. Cost Optimization Strategies

### Model Tier Selection

| Task | Model | Cost per 1K tokens (in/out) | Rationale |
|------|-------|------------------------------|-----------|
| Entity extraction | Mistral Small | $0.0001 / $0.0003 | Simple classification task |
| Email classification | Mistral Small | $0.0001 / $0.0003 | Spam detection |
| General chat | Claude Sonnet 4 | $0.003 / $0.015 | Better reasoning |
| Complex orchestration | Claude Opus 4 | $0.015 / $0.075 | Only when necessary |

### Batch Processing

```typescript
// Entity extraction cost example:
// 1 email ≈ 500 input tokens + 200 output tokens
// Cost per email with Mistral Small:
//   = (500 × $0.0001) + (200 × $0.0003)
//   = $0.00005 + $0.00006
//   = $0.00011 per email

// 1,000 emails = $0.11
// 10,000 emails = $1.10
// 100,000 emails = $11.00
```

### Usage Tracking

```typescript
// Track costs in real-time
const extractor = getEntityExtractor();
const results = await extractor.extractBatch(emails);

// Log statistics
const stats = {
  totalEmails: 1000,
  totalCost: 0.11,          // $0.11 total
  costPerEmail: 0.00011,    // $0.00011 per email
  entitiesPerEmail: 3.2     // Average entities extracted
};
```

---

## 9. Error Handling Patterns

### Entity Extraction Errors

```typescript
try {
  const result = await extractFromEmail(email);
} catch (error) {
  console.error(`Failed to extract from email ${email.id}:`, error);
  // Return empty result on error (graceful degradation)
  return {
    emailId: email.id,
    entities: [],
    spam: { isSpam: false, spamScore: 0 },
    extractedAt: new Date(),
    cost: 0,
    model: MODELS.CLASSIFIER,
  };
}
```

### JSON Parsing Errors

```typescript
private parseExtractionResponse(content: string): {
  entities: Entity[];
  spam: SpamClassification;
} {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in response');
      return { entities: [], spam: { isSpam: false, spamScore: 0 } };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!parsed.entities || !Array.isArray(parsed.entities)) {
      return { entities: [], spam: { isSpam: false, spamScore: 0 } };
    }

    // Filter invalid entities
    const validEntities = parsed.entities.filter((entity: any) => {
      return entity.type && entity.value && entity.normalized
        && typeof entity.confidence === 'number' && entity.source;
    });

    return { entities: validEntities, spam: parsed.spam || {} };
  } catch (error) {
    console.error('JSON parsing failed:', error);
    return { entities: [], spam: { isSpam: false, spamScore: 0 } };
  }
}
```

### Neo4j Connection Errors

```typescript
if (!neo4jClient.isConfigured()) {
  console.warn('[Graph] Neo4j not configured');
  return; // Graceful degradation
}

const connected = await neo4jClient.verifyConnection();
if (!connected) {
  throw new Error('Failed to connect to Neo4j');
}
```

---

## 10. Recommendations for New Relationship Features

Based on the existing architecture, here are patterns to follow when adding new relationship functionality:

### 1. Define Relationship in Graph Types

```typescript
// In src/lib/graph/types.ts

// Add new relationship type
export type RelationshipType =
  | 'MENTIONED_IN'
  | 'WORKS_WITH'
  | 'YOUR_NEW_RELATIONSHIP';  // ← Add here

// Define relationship properties
export interface YourNewRelationship extends BaseRelationshipProperties {
  customField?: string;  // Add relationship-specific fields
}

// Add to union type
export type GraphRelationship =
  | MentionedInRelationship
  | WorksWithRelationship
  | YourNewRelationship;  // ← Add here
```

### 2. Create Relationship Builder

```typescript
// In src/lib/graph/graph-builder.ts

export async function createYourNewRelationship(
  source: Entity,
  target: Entity,
  emailId: string
): Promise<void> {
  const session = neo4jClient.session();

  try {
    await session.run(`
      MATCH (s:${entityTypeToNodeLabel(source.type)} {normalized: $sourceNormalized})
      MATCH (t:${entityTypeToNodeLabel(target.type)} {normalized: $targetNormalized})
      MERGE (s)-[r:YOUR_NEW_RELATIONSHIP]->(t)
      ON CREATE SET
        r.weight = 1,
        r.emailIds = [$emailId],
        r.firstSeen = datetime(),
        r.lastSeen = datetime()
      ON MATCH SET
        r.weight = r.weight + 1,
        r.emailIds = r.emailIds + $emailId,
        r.lastSeen = datetime()
    `, {
      sourceNormalized: source.normalized,
      targetNormalized: target.normalized,
      emailId
    });
  } finally {
    await session.close();
  }
}
```

### 3. Add Query Function

```typescript
// In src/lib/graph/graph-queries.ts

export async function getYourRelationships(
  entityNormalized: string,
  limit: number = 10
): Promise<RelationshipQueryResult[]> {
  const session = neo4jClient.session();

  try {
    const result = await session.run(`
      MATCH (e {normalized: $normalized})-[r:YOUR_NEW_RELATIONSHIP]->(target)
      RETURN target, r
      ORDER BY r.weight DESC
      LIMIT $limit
    `, { normalized: entityNormalized, limit });

    return result.records.map(record => ({
      source: record.get('e').properties,
      relationship: record.get('r').properties,
      target: record.get('target').properties,
      type: 'YOUR_NEW_RELATIONSHIP'
    }));
  } finally {
    await session.close();
  }
}
```

### 4. Use LLM for Relationship Inference (Optional)

If relationships require LLM inference (e.g., detecting "mentorship" relationships):

```typescript
// In src/lib/extraction/entity-extractor.ts or new file

async function inferRelationships(
  entities: Entity[],
  emailContext: string
): Promise<Array<{ source: Entity; target: Entity; type: string }>> {
  const prompt = `
    Analyze these entities and identify relationships:

    Entities: ${JSON.stringify(entities)}
    Context: ${emailContext}

    Return JSON array of relationships:
    [{ "source": "entity1", "target": "entity2", "type": "MENTORS" }]
  `;

  const response = await getAIClient().chat(
    [{ role: 'user', content: prompt }],
    {
      model: MODELS.CLASSIFIER,
      maxTokens: 500,
      temperature: 0.1
    }
  );

  return JSON.parse(response.content);
}
```

### 5. Follow Existing Patterns

- **Use MERGE pattern** for Neo4j upserts (no duplicates)
- **Track weight/frequency** in relationship properties
- **Store emailIds** for traceability
- **Update firstSeen/lastSeen** timestamps
- **Filter by confidence** threshold (> 0.7)
- **Log costs** for LLM operations
- **Handle errors gracefully** (return empty results, don't throw)

---

## 11. File Locations Summary

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Weaviate Schema | `/src/lib/weaviate/schema.ts` | Collection definitions |
| Entity Storage | `/src/lib/weaviate/entities.ts` | Save/search/delete operations |
| Entity Types | `/src/lib/extraction/types.ts` | TypeScript interfaces |
| Entity Extractor | `/src/lib/extraction/entity-extractor.ts` | LLM extraction logic |
| AI Client | `/src/lib/ai/client.ts` | OpenRouter integration |
| AI Models | `/src/lib/ai/models.ts` | Model configs and costs |
| Graph Types | `/src/lib/graph/types.ts` | Neo4j node/relationship types |
| Graph Builder | `/src/lib/graph/graph-builder.ts` | Build graph from extractions |
| Graph Queries | `/src/lib/graph/graph-queries.ts` | Query patterns |
| Neo4j Client | `/src/lib/graph/neo4j-client.ts` | Neo4j driver wrapper |

---

## 12. Next Steps for Relationship Development

1. **Review existing relationship types** in `/src/lib/graph/types.ts`
2. **Identify which relationships require LLM inference** vs. co-occurrence analysis
3. **Follow the builder pattern** in `/src/lib/graph/graph-builder.ts`
4. **Add query functions** in `/src/lib/graph/graph-queries.ts`
5. **Test with Neo4j Aura** (configure `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`)
6. **Use cheap tier (Mistral Small)** for relationship inference to minimize costs
7. **Track costs** using `client.getUsageStats()` and `getTotalCost()`
8. **Handle errors gracefully** (return empty results on failure)

---

## Conclusion

Izzie2 has a **robust foundation** for entity extraction, storage, and relationship analysis:

✅ **Weaviate**: 7 entity collections with BM25 search, user-scoped storage
✅ **OpenRouter AI**: Three-tier model routing with cost tracking
✅ **Entity Extraction**: LLM-based extraction with confidence scoring and spam detection
✅ **Neo4j Graph**: Full relationship graph with 7 relationship types
✅ **Incremental Updates**: Upsert patterns for entity frequency and relationship weight
✅ **Error Handling**: Graceful degradation throughout

**Recommended Pattern for New Relationships:**
1. Define relationship in graph types
2. Create builder function with MERGE pattern
3. Add query function for retrieval
4. Use LLM inference if needed (cheap tier)
5. Track costs and handle errors

**Cost Efficiency:**
- Entity extraction: ~$0.00011 per email (Mistral Small)
- Batch of 10,000 emails: ~$1.10 total
- Relationship inference: Add ~$0.00005 per entity pair

This architecture enables **scalable, cost-effective entity extraction and relationship discovery** for email intelligence.
