# Weaviate Relationship Storage

Storage layer for inferred relationships between entities in Izzie2.

## Overview

The relationship storage layer uses Weaviate Cloud to persist and query relationships between extracted entities (people, companies, projects, etc.). It supports:

- **Saving relationships** with confidence scores and evidence
- **Querying relationships** by entity or user
- **Building graph visualizations** for network analysis
- **Tracking statistics** on relationship types and confidence

## Architecture

```
┌─────────────────────────────────────────┐
│  Relationship Inference (LLM)          │
│  - Analyzes email content              │
│  - Identifies entity relationships     │
│  - Assigns confidence scores           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Weaviate Relationship Storage          │
│  - saveRelationships()                  │
│  - getEntityRelationships()             │
│  - buildRelationshipGraph()             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Weaviate Cloud                         │
│  Collection: Relationship               │
│  - fromEntityType / fromEntityValue     │
│  - toEntityType / toEntityValue         │
│  - relationshipType (WORKS_WITH, etc.)  │
│  - confidence, evidence, sourceId       │
└─────────────────────────────────────────┘
```

## Schema

### Relationship Collection

The `Relationship` collection stores directional relationships:

```typescript
{
  fromEntityType: 'person' | 'company' | 'project' | 'topic' | 'location' | 'date' | 'action_item',
  fromEntityValue: string,      // Normalized entity value (lowercase)
  toEntityType: EntityType,
  toEntityValue: string,         // Normalized entity value (lowercase)
  relationshipType: RelationshipType,  // WORKS_WITH, REPORTS_TO, etc.
  confidence: number,            // 0-1 from LLM
  evidence: string,              // Quote/context supporting this relationship
  sourceId: string,              // Email/doc this came from
  userId: string,                // User who owns this relationship
  inferredAt: string             // ISO timestamp
}
```

### Relationship Types

```typescript
// Person relationships
'WORKS_WITH'        // Person ↔ Person (colleagues)
'REPORTS_TO'        // Person → Person (hierarchy)
'WORKS_FOR'         // Person → Company
'LEADS'             // Person → Project
'WORKS_ON'          // Person → Project
'EXPERT_IN'         // Person → Topic
'LOCATED_IN'        // Person/Company → Location

// Company relationships
'PARTNERS_WITH'     // Company ↔ Company
'COMPETES_WITH'     // Company ↔ Company
'OWNS'              // Company → Project

// Project relationships
'RELATED_TO'        // Project ↔ Project
'DEPENDS_ON'        // Project → Project
'PART_OF'           // Project → Project (parent)

// Topic relationships
'SUBTOPIC_OF'       // Topic → Topic
'ASSOCIATED_WITH'   // Topic ↔ Topic
```

## Usage

### Save Relationships

```typescript
import { saveRelationships } from '@/lib/weaviate';

const relationships: InferredRelationship[] = [
  {
    fromEntityType: 'person',
    fromEntityValue: 'john doe',
    toEntityType: 'company',
    toEntityValue: 'acme corp',
    relationshipType: 'WORKS_FOR',
    confidence: 0.95,
    evidence: 'John Doe is the CTO at Acme Corp',
    sourceId: 'email-123',
    userId: 'user-456',
    inferredAt: new Date().toISOString(),
  },
];

const savedCount = await saveRelationships(relationships, userId);
```

### Query Relationships for an Entity

```typescript
import { getEntityRelationships } from '@/lib/weaviate';

// Get all relationships for "John Doe"
const relationships = await getEntityRelationships(
  'person',
  'john doe',
  userId
);

// Returns relationships where John Doe is either source or target
```

### Build Graph Visualization

```typescript
import { buildRelationshipGraph } from '@/lib/weaviate';

const graph = await buildRelationshipGraph(userId, {
  minConfidence: 0.7,
});

// graph.nodes: Array of entities with size and color
// graph.edges: Array of relationships with weight
// graph.stats: { totalNodes, totalEdges, avgConnections }
```

### Get Statistics

```typescript
import { getRelationshipStats } from '@/lib/weaviate';

const stats = await getRelationshipStats(userId);

// {
//   total: 150,
//   byType: {
//     WORKS_WITH: 45,
//     WORKS_FOR: 30,
//     LEADS: 20,
//     ...
//   },
//   avgConfidence: 0.87
// }
```

## API Reference

### `saveRelationships(relationships, userId)`

Batch save relationships to Weaviate.

- **Parameters**:
  - `relationships`: Array of `InferredRelationship` objects
  - `userId`: User ID who owns these relationships
- **Returns**: `Promise<number>` - Count of saved relationships
- **Throws**: Error if Weaviate operation fails

### `getEntityRelationships(entityType, entityValue, userId?)`

Get all relationships for a specific entity.

- **Parameters**:
  - `entityType`: Type of entity (person, company, etc.)
  - `entityValue`: Normalized entity value
  - `userId`: Optional user filter
- **Returns**: `Promise<InferredRelationship[]>`

### `getAllRelationships(userId?, limit?)`

Get all relationships for a user.

- **Parameters**:
  - `userId`: Optional user filter
  - `limit`: Max results (default: 1000)
- **Returns**: `Promise<InferredRelationship[]>`

### `buildRelationshipGraph(userId?, options?)`

Build graph representation for visualization.

- **Parameters**:
  - `userId`: Optional user filter
  - `options`:
    - `centerEntity`: Focus on specific entity
    - `maxDepth`: Max depth from center (not implemented)
    - `minConfidence`: Filter by confidence (default: 0.5)
- **Returns**: `Promise<RelationshipGraph>`

### `getRelationshipStats(userId?)`

Get statistics on relationships.

- **Parameters**:
  - `userId`: Optional user filter
- **Returns**: `Promise<{ total, byType, avgConfidence }>`

### `deleteRelationshipsBySource(sourceId, userId)`

Delete all relationships from a specific source.

- **Parameters**:
  - `sourceId`: Email/event ID
  - `userId`: User ID
- **Returns**: `Promise<number>` - Count of deleted relationships

## Testing

Run the test script:

```bash
npx tsx scripts/test-relationship-storage.ts
```

Expected output:
```
🧪 Testing Weaviate Relationship Storage

1️⃣  Initializing schema...
✅ Schema initialized

2️⃣  Saving test relationships...
✅ Saved 3 relationships

3️⃣  Fetching all relationships...
✅ Found 3 total relationships
   ...

🎉 All tests passed!
```

## Performance Considerations

- **Batch Inserts**: Use `insertMany()` for efficiency
- **Query Limits**: Default limit is 500-1000 objects
- **Filtering**: Done in-memory after fetch (Weaviate has limited filter support)
- **Graph Building**: May be slow for large datasets (>10k relationships)

## Future Enhancements

- [ ] Add vector search for semantic relationship queries
- [ ] Implement relationship strength scoring (frequency + confidence)
- [ ] Add temporal decay for old relationships
- [ ] Support sub-graph extraction around center entity
- [ ] Add relationship validation and conflict resolution
- [ ] Implement relationship clustering and pattern detection

## Related Files

- `/src/lib/weaviate/relationships.ts` - Storage implementation
- `/src/lib/weaviate/schema.ts` - Collection schema
- `/src/lib/relationships/types.ts` - Type definitions
- `/scripts/test-relationship-storage.ts` - Test script
