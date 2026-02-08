# Temporal Relationship Models for Knowledge Graphs

**Research Date:** 2026-02-07
**Context:** Izzie2 Personal Knowledge Management System
**Goal:** Design a system to handle temporal state changes in relationships (e.g., "I'm not a full-time employee of Duetto anymore" triggering `WORKS_FOR` -> past-tense relationship)

---

## Executive Summary

This research analyzes approaches for handling temporal relationships in knowledge graphs, specifically how to model relationship state changes like employment transitions. After examining Wikidata, Schema.org, OWL-Time, personal CRMs, and graph database patterns, the **recommended approach** for izzie2 is:

**Temporal Qualifiers Pattern** - Add `startDate`, `endDate`, and `status` fields to existing relationships rather than creating separate relationship types like `WORKS_FOR_FORMERLY`.

**Key Reasons:**
1. Query simplicity - Single relationship type with temporal filters
2. Conversational update compatibility - Easy to map "I left Duetto" to `UPDATE endDate`
3. Schema evolution - Additive change, no relationship type explosion
4. Industry alignment - Matches Schema.org Role pattern and Wikidata qualifiers

---

## Table of Contents

1. [Current Schema Context](#current-schema-context)
2. [Approaches Comparison](#approaches-comparison)
3. [Detailed Analysis of Each Approach](#detailed-analysis)
4. [Recommended Pattern for Izzie2](#recommended-pattern)
5. [Schema Migration Plan](#schema-migration-plan)
6. [Conversational Update Flow](#conversational-update-flow)
7. [Implementation Considerations](#implementation-considerations)

---

## Current Schema Context

### Existing Relationship Model (Weaviate)

```typescript
// src/lib/relationships/types.ts
interface InferredRelationship {
  id?: string;
  fromEntityType: EntityType;
  fromEntityValue: string;      // normalized value
  toEntityType: EntityType;
  toEntityValue: string;        // normalized value
  relationshipType: RelationshipType;
  confidence: number;           // 0-1 from LLM
  evidence: string;             // Quote/context supporting this
  sourceId: string;             // Email/doc this came from
  inferredAt: string;           // ISO timestamp
  userId: string;
}
```

### Current Relationship Types

```typescript
type RelationshipType =
  | 'WORKS_WITH'        // Person <-> Person (colleagues)
  | 'REPORTS_TO'        // Person -> Person (hierarchy)
  | 'WORKS_FOR'         // Person -> Company
  | 'LEADS'             // Person -> Project
  | 'WORKS_ON'          // Person -> Project
  | 'EXPERT_IN'         // Person -> Topic
  | 'LOCATED_IN'        // Person/Company -> Location
  | 'FAMILY_OF'         // Person <-> Person
  | 'MARRIED_TO'        // Person <-> Person
  | 'SIBLING_OF'        // Person <-> Person
  | 'SAME_AS'           // Entity resolution
  // ... company and project relationships
```

### Current Limitations

1. **No temporal fields** - Cannot express "formerly worked for" vs "currently works for"
2. **No validity periods** - Relationships are assumed permanent
3. **No status tracking** - Cannot mark relationships as inactive without deletion
4. **inferredAt only** - Captures when we learned about it, not when it was true

---

## Approaches Comparison

### Summary Table

| Approach | Description | Pros | Cons | Best For |
|----------|-------------|------|------|----------|
| **A. Separate Relationship Types** | `WORKS_FOR` + `WORKS_FOR_FORMERLY` | Simple queries for current state | Type explosion, complex migrations | Small ontologies |
| **B. Temporal Qualifiers** | Add `startDate`, `endDate`, `status` to relationships | Flexible, queryable, evolvable | Slightly more complex queries | **izzie2 (recommended)** |
| **C. Reification (Role Pattern)** | Intermediate node for each relationship instance | Maximum flexibility | Significant complexity | Enterprise KGs |
| **D. Graph Versioning** | Snapshot entire graph at points in time | Time-travel queries | Storage explosion | Audit systems |

### Detailed Scoring

| Criterion | Separate Types | Temporal Qualifiers | Reification | Graph Versioning |
|-----------|---------------|---------------------|-------------|------------------|
| Query Simplicity | 5/5 (for current) | 4/5 | 2/5 | 3/5 |
| Conversational Updates | 2/5 | 5/5 | 4/5 | 2/5 |
| Schema Evolution | 2/5 | 5/5 | 4/5 | 3/5 |
| Storage Efficiency | 4/5 | 5/5 | 3/5 | 1/5 |
| History Preservation | 3/5 | 4/5 | 5/5 | 5/5 |
| Implementation Effort | 3/5 | 4/5 | 2/5 | 2/5 |
| **Total** | **19/30** | **27/30** | **20/30** | **16/30** |

---

## Detailed Analysis

### Approach A: Separate Relationship Types

**Pattern:** Create distinct relationship types for each temporal state.

```
WORKS_FOR         -> Current employment
WORKS_FOR_FORMERLY -> Past employment
WORKS_FOR_FUTURE   -> Planned employment (e.g., "I'm joining Google next month")
```

**Wikidata Example:** Uses this for some relationships (e.g., `former spouse` vs `spouse`)

**Implementation:**
```typescript
type RelationshipType =
  | 'WORKS_FOR'
  | 'WORKS_FOR_FORMERLY'
  | 'WORKED_WITH_FORMERLY'
  | 'REPORTS_TO'
  | 'REPORTED_TO_FORMERLY'
  // ... explosion of types
```

**Pros:**
- Simplest queries: `WHERE relationshipType = 'WORKS_FOR'` for current
- No schema changes beyond adding types
- Clear semantics

**Cons:**
- **Type explosion**: Every temporal relationship needs 2-3 variants (current, past, future)
- **Migration complexity**: Converting existing `WORKS_FOR` to `WORKS_FOR_FORMERLY` requires inferring dates
- **Conversational update friction**: "I left Duetto" requires: find `WORKS_FOR`, delete it, create `WORKS_FOR_FORMERLY`
- **Lost information**: When did they leave? Can't query "who worked at Duetto in 2024?"

**Verdict:** Not recommended for izzie2 due to type explosion and poor fit for conversational updates.

---

### Approach B: Temporal Qualifiers (Recommended)

**Pattern:** Add temporal metadata fields to relationships.

**Industry Examples:**
- **Wikidata:** Statement qualifiers (`P580` start date, `P582` end date)
- **Schema.org Role:** `startDate`, `endDate` on Role intermediate
- **OWL-Time:** `hasBeginning`, `hasEnd` properties
- **LinkedIn:** Employment positions with date ranges

**Schema.org Role Example:**
```json
{
  "@type": "Person",
  "name": "Masa",
  "worksFor": {
    "@type": "Role",
    "worksFor": { "@type": "Organization", "name": "Duetto" },
    "startDate": "2020-01-15",
    "endDate": "2026-01-15",
    "roleName": "Engineer"
  }
}
```

**Wikidata Qualifiers Example:**
```
Statement: Barack Obama -> educated at -> Harvard Law School
Qualifiers:
  - start time: 1988
  - end time: 1991
  - academic degree: J.D.
```

**Proposed Schema for izzie2:**
```typescript
interface TemporalRelationship {
  // Existing fields
  id?: string;
  fromEntityType: EntityType;
  fromEntityValue: string;
  toEntityType: EntityType;
  toEntityValue: string;
  relationshipType: RelationshipType;
  confidence: number;
  evidence: string;
  sourceId: string;
  inferredAt: string;
  userId: string;

  // NEW: Temporal qualifiers
  startDate?: string;     // ISO date - when relationship began
  endDate?: string;       // ISO date - when relationship ended (null = current)
  status: 'active' | 'former' | 'future' | 'unknown';

  // NEW: Additional context
  roleTitle?: string;     // For employment: "Senior Engineer", "CEO"
  lastVerified?: string;  // When we last confirmed this is still true
}
```

**Query Examples:**

```typescript
// Current employees at Duetto
WHERE relationshipType = 'WORKS_FOR'
  AND toEntityValue = 'duetto'
  AND status = 'active'

// Who worked at Duetto in 2024?
WHERE relationshipType = 'WORKS_FOR'
  AND toEntityValue = 'duetto'
  AND startDate <= '2024-12-31'
  AND (endDate IS NULL OR endDate >= '2024-01-01')

// All relationships for a person (historical view)
WHERE fromEntityValue = 'john smith'
ORDER BY startDate DESC
```

**Pros:**
- **Single relationship type** - No explosion of `_FORMERLY` variants
- **Query flexibility** - Filter by current, historical, or time range
- **Conversational update friendly** - "I left Duetto" maps directly to `SET endDate = NOW(), status = 'former'`
- **Preserves history** - Can see career progression, timing
- **Industry standard** - Matches Schema.org, Wikidata patterns

**Cons:**
- Slightly more complex queries for "current state only"
- Need to handle null `endDate` as "ongoing"
- Additional fields to maintain

**Verdict:** **Recommended for izzie2.** Best balance of flexibility, simplicity, and conversational compatibility.

---

### Approach C: Reification (Role Pattern)

**Pattern:** Create an intermediate node for each relationship instance, allowing arbitrary properties.

**Graph Structure:**
```
Person:Masa --[HAS_ROLE]--> Role:123 --[AT_COMPANY]--> Company:Duetto
                             |
                             +-- startDate: 2020-01-15
                             +-- endDate: 2026-01-15
                             +-- title: "Engineer"
                             +-- status: "former"
```

**Schema.org describes this as:**
> "Role is used to represent additional information about a relationship or property. For example a Role can be used to say that a 'member' role linking some SportsTeam to a player occurred during a particular time period."

**Implementation:**
```typescript
// New Role/Membership entity
interface RelationshipRole {
  id: string;
  subjectType: EntityType;
  subjectValue: string;
  objectType: EntityType;
  objectValue: string;
  relationshipType: RelationshipType;

  // Role-specific properties
  startDate?: string;
  endDate?: string;
  status: string;
  title?: string;

  // Arbitrary additional context
  metadata: Record<string, any>;
}
```

**Pros:**
- Maximum flexibility for relationship attributes
- Clean graph model (each instance is a node)
- Supports complex relationship scenarios (e.g., same person, same company, multiple roles over time)

**Cons:**
- **Significant complexity** - New entity type, new collection, changed queries
- **Query complexity** - Finding "current employer" requires traversing through Role nodes
- **Over-engineering** - Most personal KG relationships don't need this flexibility
- **Migration effort** - Major schema change

**Verdict:** Over-engineered for izzie2's current needs. Consider if relationship complexity grows significantly.

---

### Approach D: Graph Versioning / Snapshots

**Pattern:** Store multiple versions of the entire graph or specific subgraphs at different points in time.

**Examples:**
- Neo4j Temporal: Stores `validFrom`, `validTo` on all nodes and relationships
- Event Sourcing: Store all changes as events, reconstruct graph at any point

**Pros:**
- True time-travel queries
- Complete audit trail
- Can reconstruct exact state at any historical moment

**Cons:**
- **Storage explosion** - Every change creates new records
- **Query complexity** - Need specialized temporal query language
- **Overkill for personal KG** - izzie2 doesn't need to reconstruct "exact state on Jan 5, 2024"
- **Implementation complexity** - Requires temporal database features

**Verdict:** Not recommended. Over-engineered for personal knowledge management use case.

---

## Recommended Pattern for Izzie2

### Final Recommendation: Temporal Qualifiers (Approach B)

**Add these fields to relationships:**

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `startDate` | string (ISO date) | When relationship began | null (unknown) |
| `endDate` | string (ISO date) | When relationship ended | null (ongoing) |
| `status` | enum | Current state | 'unknown' |
| `roleTitle` | string | Position/role name | null |
| `lastVerified` | string (ISO timestamp) | When last confirmed | null |

**Status Enum Values:**

| Status | Meaning | Example |
|--------|---------|---------|
| `active` | Currently true | "Currently works at Google" |
| `former` | Was true, now ended | "Used to work at Duetto" |
| `future` | Will become true | "Starting at Meta next month" |
| `unknown` | Temporal state uncertain | Legacy data without dates |

### Relationship Type Decisions

**Keep single types (no `_FORMERLY` variants):**

```typescript
// DO NOT DO THIS:
type RelationshipType =
  | 'WORKS_FOR'
  | 'WORKS_FOR_FORMERLY'  // NO!
  | 'WORKS_FOR_FUTURE'    // NO!

// DO THIS:
type RelationshipType =
  | 'WORKS_FOR'  // + status: 'active' | 'former' | 'future'
```

**Rationale:**
- The relationship type describes the *kind* of relationship
- The temporal qualifiers describe *when* it was/is/will be true
- "Person WORKS_FOR Company" is true whether current, past, or future - the timing is metadata

---

## Schema Migration Plan

### Phase 1: Add Fields to Weaviate Relationship Collection

**Update Weaviate schema** in `src/lib/weaviate/schema.ts`:

```typescript
// In RELATIONSHIP_COLLECTION properties
{ name: 'startDate', dataType: 'text', description: 'ISO date when relationship began' },
{ name: 'endDate', dataType: 'text', description: 'ISO date when relationship ended (null = ongoing)' },
{ name: 'status', dataType: 'text', description: 'Relationship status: active | former | future | unknown' },
{ name: 'roleTitle', dataType: 'text', description: 'Position/role name if applicable' },
{ name: 'lastVerified', dataType: 'text', description: 'ISO timestamp of last confirmation' },
```

### Phase 2: Update TypeScript Types

**Update** `src/lib/relationships/types.ts`:

```typescript
// Relationship status enum
export type RelationshipStatus = 'active' | 'former' | 'future' | 'unknown';

export interface InferredRelationship {
  // Existing fields...

  // NEW: Temporal qualifiers
  startDate?: string;     // ISO date
  endDate?: string;       // ISO date (null = ongoing if status is active)
  status: RelationshipStatus;
  roleTitle?: string;
  lastVerified?: string;  // ISO timestamp
}
```

### Phase 3: Migration for Existing Data

**Strategy:** Mark all existing relationships as `status: 'unknown'`

```typescript
// Migration script
async function migrateRelationshipsToTemporal(userId: string) {
  const relationships = await getAllRelationships(userId);

  for (const rel of relationships) {
    await updateRelationship(rel.id, userId, {
      status: 'unknown',  // Can't infer from existing data
      lastVerified: null  // Not verified yet
    });
  }
}
```

**Gradual improvement:** As users interact, relationships get status updates:
- Conversational corrections: "I don't work at Duetto anymore" -> `status: 'former'`
- New extractions: Include temporal analysis -> `status: 'active'`
- Verification prompts: "Do you still work at X?" -> Update `lastVerified`

### Phase 4: Update Extraction Prompts

**Update LLM prompts** in `src/lib/relationships/inference.ts` to extract temporal info:

```typescript
const INFERENCE_PROMPT = `...
When inferring relationships, also determine:
- startDate: When did this relationship begin? (if mentioned)
- endDate: Has this relationship ended? When?
- status: Is this relationship current ("active"), past ("former"), or planned ("future")?
- roleTitle: What role/position? (for employment, leadership)

Examples:
- "John joined Acme in 2020 as a Senior Engineer"
  -> WORKS_FOR with startDate: "2020", status: "active", roleTitle: "Senior Engineer"

- "Sarah used to work at Globex, she left last year"
  -> WORKS_FOR with status: "former", endDate: estimated from "last year"

- "Mike is starting at TechCorp next month"
  -> WORKS_FOR with status: "future"
...`;
```

---

## Conversational Update Flow

### User Correction Scenarios

**Scenario 1: Employment End**
```
User: "I'm not a full-time employee of Duetto anymore"

System Action:
1. Parse intent: Relationship change notification
2. Identify entities: User (self) -> Company (Duetto)
3. Find relationship: WORKS_FOR where user -> Duetto
4. Update: SET endDate = TODAY, status = 'former'
5. Confirm: "Got it! I've updated your relationship with Duetto to show you formerly worked there."
```

**Scenario 2: New Employment**
```
User: "I just started working at Google"

System Action:
1. Parse intent: New relationship notification
2. Create: WORKS_FOR(user, Google) with startDate = TODAY, status = 'active'
3. Optional: Check for existing active WORKS_FOR and prompt about ending them
4. Confirm: "Congratulations! I've added Google as your current employer."
```

**Scenario 3: Role Change (Same Company)**
```
User: "I got promoted to Engineering Manager at Acme"

System Action:
1. Parse intent: Role update at existing employer
2. Option A: Update existing relationship: SET roleTitle = 'Engineering Manager'
3. Option B: End old, create new (preserves role history):
   - End: WORKS_FOR(user, Acme, roleTitle: 'Engineer') -> status = 'former', endDate = TODAY
   - Create: WORKS_FOR(user, Acme, roleTitle: 'Engineering Manager') -> startDate = TODAY, status = 'active'
4. Recommend Option B for history preservation
```

### Implementation Pattern

```typescript
// In chat handler or conversational AI
async function handleRelationshipUpdate(
  userId: string,
  correction: {
    type: 'end_relationship' | 'start_relationship' | 'update_role';
    entityType: EntityType;
    entityValue: string;
    relationshipType: RelationshipType;
    newStatus?: RelationshipStatus;
    newRole?: string;
    date?: string;  // Optional explicit date
  }
) {
  const { type, entityType, entityValue, relationshipType } = correction;

  switch (type) {
    case 'end_relationship': {
      // Find active relationship
      const existing = await findActiveRelationship(
        userId,
        entityType,
        entityValue,
        relationshipType
      );

      if (existing) {
        await updateRelationship(existing.id, userId, {
          endDate: correction.date || new Date().toISOString().split('T')[0],
          status: 'former',
          lastVerified: new Date().toISOString()
        });
        return { success: true, action: 'ended', relationship: existing };
      }
      return { success: false, error: 'No active relationship found' };
    }

    case 'start_relationship': {
      // Check for existing active relationship
      const existing = await findActiveRelationship(
        userId,
        entityType,
        entityValue,
        relationshipType
      );

      if (existing) {
        return { success: false, error: 'Active relationship already exists' };
      }

      const newRel = await createRelationship({
        userId,
        fromEntityType: 'person',  // Assuming self
        fromEntityValue: getUserDisplayName(userId),
        toEntityType: entityType,
        toEntityValue: entityValue,
        relationshipType,
        startDate: correction.date || new Date().toISOString().split('T')[0],
        status: 'active',
        roleTitle: correction.newRole,
        confidence: 1.0,  // User-confirmed
        evidence: 'User reported via conversation',
        lastVerified: new Date().toISOString()
      });

      return { success: true, action: 'created', relationship: newRel };
    }

    case 'update_role': {
      // For role changes, end old and create new (preserves history)
      const existing = await findActiveRelationship(
        userId,
        entityType,
        entityValue,
        relationshipType
      );

      if (existing) {
        // End current role
        await updateRelationship(existing.id, userId, {
          endDate: correction.date || new Date().toISOString().split('T')[0],
          status: 'former',
          lastVerified: new Date().toISOString()
        });

        // Create new role
        const newRel = await createRelationship({
          ...existing,
          id: undefined,  // New ID
          roleTitle: correction.newRole,
          startDate: correction.date || new Date().toISOString().split('T')[0],
          status: 'active',
          confidence: 1.0,
          evidence: 'User reported role change via conversation',
          lastVerified: new Date().toISOString()
        });

        return { success: true, action: 'role_changed', oldRel: existing, newRel };
      }

      return { success: false, error: 'No active relationship found to update' };
    }
  }
}
```

### Intent Detection Patterns

```typescript
// Patterns for detecting relationship update intents
const RELATIONSHIP_UPDATE_PATTERNS = {
  end_employment: [
    /(?:i'?m\s+)?(?:no\s+longer|not\s+anymore|not\s+a)\s+.*(?:at|with|for)\s+(.+)/i,
    /(?:i\s+)?left\s+(.+)/i,
    /(?:i\s+)?quit\s+(?:my\s+job\s+at\s+)?(.+)/i,
    /(?:i\s+)?(?:got|was)\s+(?:laid\s+off|fired)\s+from\s+(.+)/i,
    /(?:i\s+)?resigned\s+from\s+(.+)/i,
  ],
  start_employment: [
    /(?:i\s+)?(?:just\s+)?started\s+(?:working\s+)?(?:at|with|for)\s+(.+)/i,
    /(?:i\s+)?(?:just\s+)?joined\s+(.+)/i,
    /(?:i\s+)?(?:got|accepted)\s+(?:a\s+)?(?:new\s+)?job\s+at\s+(.+)/i,
    /(?:i'm\s+)?(?:now\s+)?(?:working\s+)?(?:at|with|for)\s+(.+)/i,
  ],
  role_change: [
    /(?:i\s+)?(?:got|was)\s+promoted\s+to\s+(.+)/i,
    /(?:i'm\s+)?now\s+(?:a|an|the)\s+(.+)\s+(?:at|with|for)\s+(.+)/i,
    /my\s+(?:new\s+)?(?:title|role|position)\s+is\s+(.+)/i,
  ]
};
```

---

## Implementation Considerations

### Weaviate-Specific Notes

1. **No native date type** - Store dates as text (ISO format) for reliable filtering
2. **Filter syntax** - Use `byProperty().equal()` for exact status matches
3. **Null handling** - `endDate: null` means "ongoing" - filter with `IS NULL` check

```typescript
// Query: Current employment relationships
const currentEmployment = await tenantCollection.query.fetchObjects({
  filters: Filters.and(
    tenantCollection.filter.byProperty('relationshipType').equal('WORKS_FOR'),
    tenantCollection.filter.byProperty('status').equal('active')
  ),
  // Note: Can't easily filter endDate IS NULL in Weaviate
  // May need post-processing or use status field as primary indicator
});
```

### Drizzle/Postgres Considerations

If storing relationships in Postgres (in addition to or instead of Weaviate):

```typescript
// Potential postgres table for temporal relationships
export const temporalRelationships = pgTable(
  'temporal_relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id).notNull(),
    fromEntityType: text('from_entity_type').notNull(),
    fromEntityValue: text('from_entity_value').notNull(),
    toEntityType: text('to_entity_type').notNull(),
    toEntityValue: text('to_entity_value').notNull(),
    relationshipType: text('relationship_type').notNull(),

    // Temporal fields
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: text('status').notNull().default('unknown'),
    roleTitle: text('role_title'),

    // Metadata
    confidence: real('confidence').notNull(),
    evidence: text('evidence'),
    sourceId: text('source_id'),
    inferredAt: timestamp('inferred_at').defaultNow().notNull(),
    lastVerified: timestamp('last_verified'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for temporal queries
    statusIdx: index('relationships_status_idx').on(table.status),
    dateRangeIdx: index('relationships_date_range_idx').on(table.startDate, table.endDate),
    userEntityIdx: index('relationships_user_entity_idx').on(table.userId, table.fromEntityValue, table.toEntityValue),
  })
);
```

### Edge Cases

1. **Unknown dates** - Use `status: 'active'` or `status: 'former'` with null dates
2. **Approximate dates** - Store "2024" as "2024-01-01" with metadata flag for precision
3. **Overlapping relationships** - Same person at same company twice (different periods) - OK, they're different relationship instances
4. **Self-referential** - User refers to themselves in third person - need identity resolution

### Verification Flow

```typescript
// Periodic verification of relationships
async function verifyStaleRelationships(userId: string) {
  const staleThreshold = new Date();
  staleThreshold.setMonth(staleThreshold.getMonth() - 6);  // 6 months

  const staleRelationships = await findRelationships(userId, {
    status: 'active',
    lastVerifiedBefore: staleThreshold
  });

  // Queue for user verification prompt
  // "Are you still working at Duetto?"
  return staleRelationships;
}
```

---

## Summary

### What to Implement

1. **Add temporal fields** to Weaviate Relationship collection:
   - `startDate`, `endDate`, `status`, `roleTitle`, `lastVerified`

2. **Update TypeScript types** with new fields and `RelationshipStatus` enum

3. **Migrate existing data** to `status: 'unknown'`

4. **Update extraction prompts** to infer temporal information

5. **Add conversational update handler** to process user corrections

6. **Add helper functions** for finding/updating relationships by temporal criteria

### What NOT to Do

1. **Do NOT** create separate relationship types (`WORKS_FOR_FORMERLY`)
2. **Do NOT** delete relationships when they end - update status instead
3. **Do NOT** require dates for all relationships - make them optional with `unknown` status

### Next Steps

1. [ ] Create Weaviate schema migration script
2. [ ] Update TypeScript types in `src/lib/relationships/types.ts`
3. [ ] Add temporal filtering to `src/lib/weaviate/relationships.ts`
4. [ ] Update LLM prompts for temporal inference
5. [ ] Implement conversational correction handler
6. [ ] Add UI for viewing relationship history (timeline view)
7. [ ] Add verification prompts for stale relationships

---

## References

- [OWL-Time W3C Recommendation](https://www.w3.org/TR/owl-time/) - Temporal intervals and Allen's algebra
- [Schema.org Role](https://schema.org/Role) - Temporal relationship qualification pattern
- [Wikidata Qualifiers](https://www.wikidata.org/wiki/Help:Qualifiers) - Statement qualification model
- Monica CRM, Clay, Dex - Personal CRM interaction history patterns
- Neo4j Temporal - Graph database temporal modeling
