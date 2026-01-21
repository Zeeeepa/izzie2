# Entity Relationships in izzie2 - Research Summary

**Date:** 2026-01-20
**Context:** User wants to "build relationships" - understanding what relationships means between extracted entities

## Executive Summary

**izzie2 already has a comprehensive relationship system** for entities. The infrastructure is fully built:
- **Relationship types defined**: 15 relationship types covering person, company, project, topic, and location connections
- **Storage layer**: Weaviate collection (`Relationship`) with full CRUD operations
- **Inference engine**: LLM-powered relationship discovery from entity co-occurrence
- **Visualization**: Interactive graph dashboard at `/dashboard/relationships`
- **APIs**: Full REST API for relationship management

The user likely needs to **run relationship inference** on existing entities, not build the feature.

---

## 1. Existing Relationship Infrastructure

### 1.1 Relationship Types (Already Defined)

**Location:** `src/lib/relationships/types.ts`

```typescript
export type RelationshipType =
  // Person relationships
  | 'WORKS_WITH'        // Person <-> Person (colleagues)
  | 'REPORTS_TO'        // Person -> Person (hierarchy)
  | 'WORKS_FOR'         // Person -> Company
  | 'LEADS'             // Person -> Project
  | 'WORKS_ON'          // Person -> Project
  | 'EXPERT_IN'         // Person -> Topic
  | 'LOCATED_IN'        // Person/Company -> Location
  // Company relationships
  | 'PARTNERS_WITH'     // Company <-> Company
  | 'COMPETES_WITH'     // Company <-> Company
  | 'OWNS'              // Company -> Project
  // Project relationships
  | 'RELATED_TO'        // Project <-> Project
  | 'DEPENDS_ON'        // Project -> Project
  | 'PART_OF'           // Project -> Project (parent)
  // Topic relationships
  | 'SUBTOPIC_OF'       // Topic -> Topic
  | 'ASSOCIATED_WITH';  // Topic <-> Topic
```

### 1.2 Relationship Data Structure

```typescript
interface InferredRelationship {
  id?: string;
  fromEntityType: EntityType;    // person, company, project, topic, location
  fromEntityValue: string;       // normalized value
  toEntityType: EntityType;
  toEntityValue: string;         // normalized value
  relationshipType: RelationshipType;
  confidence: number;            // 0-1 from LLM
  evidence: string;              // Quote/context supporting this
  sourceId: string;              // Email/doc this came from
  inferredAt: string;            // ISO timestamp
  userId: string;
}
```

### 1.3 Graph Visualization Types

```typescript
interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  size?: number;        // Based on connection count
  color?: string;
}

interface GraphEdge {
  source: string;       // node id
  target: string;       // node id
  type: RelationshipType;
  weight: number;       // Based on confidence * occurrences
  label?: string;
}
```

---

## 2. Relationship Inference System

### 2.1 How It Works

**Location:** `src/lib/relationships/inference.ts`

1. **Input**: List of entities + source content (email body, etc.)
2. **LLM Analysis**: Claude analyzes co-occurrence and context
3. **Validation**: Relationships validated against type constraints
4. **Output**: Array of `InferredRelationship` with confidence scores

**Validation Rules (from code):**
```typescript
const VALID_RELATIONSHIPS: Record<RelationshipType, [EntityType[], EntityType[]]> = {
  'WORKS_WITH': [['person'], ['person']],
  'REPORTS_TO': [['person'], ['person']],
  'WORKS_FOR': [['person'], ['company']],
  'LEADS': [['person'], ['project']],
  'WORKS_ON': [['person'], ['project']],
  'EXPERT_IN': [['person'], ['topic']],
  'LOCATED_IN': [['person', 'company'], ['location']],
  'PARTNERS_WITH': [['company'], ['company']],
  'COMPETES_WITH': [['company'], ['company']],
  'OWNS': [['company'], ['project']],
  'RELATED_TO': [['project', 'topic'], ['project', 'topic']],
  'DEPENDS_ON': [['project'], ['project']],
  'PART_OF': [['project'], ['project']],
  'SUBTOPIC_OF': [['topic'], ['topic']],
  'ASSOCIATED_WITH': [['topic'], ['topic']],
};
```

### 2.2 LLM Prompt Used

The inference prompt instructs the LLM to:
- Only infer relationships with clear evidence in content
- Set confidence based on how explicitly stated (0.5-1.0)
- Include brief quote as evidence
- Focus on meaningful relationships
- Maximum 10 relationships per analysis

---

## 3. Storage Layer (Weaviate)

### 3.1 Relationship Collection Schema

**Location:** `src/lib/weaviate/schema.ts`

```typescript
{
  name: 'Relationship',
  properties: [
    { name: 'fromEntityType', dataType: 'text' },
    { name: 'fromEntityValue', dataType: 'text' },
    { name: 'toEntityType', dataType: 'text' },
    { name: 'toEntityValue', dataType: 'text' },
    { name: 'relationshipType', dataType: 'text' },
    { name: 'confidence', dataType: 'number' },
    { name: 'evidence', dataType: 'text' },
    { name: 'sourceId', dataType: 'text' },
    { name: 'userId', dataType: 'text' },
    { name: 'inferredAt', dataType: 'text' },
  ]
}
```

### 3.2 Available Functions

**Location:** `src/lib/weaviate/relationships.ts`

| Function | Purpose |
|----------|---------|
| `saveRelationships(relationships, userId)` | Batch save with deduplication |
| `getEntityRelationships(type, value, userId)` | Get relationships for specific entity |
| `getAllRelationships(userId, limit)` | Get all user relationships |
| `buildRelationshipGraph(userId, options)` | Build visualization graph |
| `getRelationshipStats(userId)` | Get relationship statistics |
| `deleteRelationshipById(id, userId)` | Delete single relationship |
| `deleteRelationshipsBySource(sourceId, userId)` | Delete by source |

---

## 4. API Endpoints

### 4.1 Relationships API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/relationships` | GET | List relationships (with filters) |
| `/api/relationships` | POST | Infer & save relationships from entities |
| `/api/relationships?id=<id>` | DELETE | Delete single relationship |
| `/api/relationships/bulk-infer` | POST | Batch inference across all entities |
| `/api/relationships/graph` | GET | Get graph data for visualization |
| `/api/relationships/stats` | GET | Get relationship statistics |

### 4.2 Query Parameters (GET /api/relationships)

- `entityType`: Filter by entity type (person, company, etc.)
- `entityValue`: Filter by entity value
- `relationshipType`: Filter by relationship type
- `limit`: Max results (default 100, max 1000)

---

## 5. Dashboard Visualization

**Location:** `/dashboard/relationships` (`src/app/dashboard/relationships/page.tsx`)

Features:
- Interactive force-directed graph (react-force-graph-2d)
- Color-coded entity types (person=blue, company=green, project=yellow, etc.)
- Filter by entity type, relationship type, and search
- Statistics panel showing relationship counts by type
- Node/edge detail panel on click
- "Run Relationship Inference" button for bulk inference

---

## 6. Data Sources for Relationships

### 6.1 Current Sources (Implemented)

1. **Email Content**: Extracted from email bodies and subjects
   - Co-occurrence of entities in same email
   - Explicit mentions ("John works for Acme")

2. **Entity Context**: Context field from entity extraction
   - Surrounding text preserved during extraction

3. **Source ID Grouping**: Entities grouped by email/event ID
   - Inference run on each source group

### 6.2 Potential Sources (Not Yet Implemented)

1. **Email Thread Analysis**
   - People on same thread = WORKS_WITH
   - Reply patterns = communication frequency

2. **Calendar Events**
   - Meeting attendees = WORKS_WITH
   - Meeting organizer = LEADS or coordinates

3. **Google Contacts**
   - Contact organization field = WORKS_FOR
   - Contact labels/groups = relationships

4. **Google Drive**
   - Document collaborators = WORKS_WITH
   - Document mentions = topic expertise

---

## 7. Recommendations for User

### 7.1 If No Relationships Exist

**Action**: Run bulk inference via dashboard or API

```bash
# Via API
curl -X POST http://localhost:3000/api/relationships/bulk-infer \
  -H "Content-Type: application/json" \
  -d '{"limit": 500, "entityTypes": ["person", "company", "project"]}'
```

Or click "Run Relationship Inference" button on `/dashboard/relationships`

### 7.2 If Relationships Exist but Need Enhancement

**Options**:
1. Add more entity types to inference (currently person, company, project)
2. Lower confidence threshold for more relationships
3. Re-run inference on new emails

### 7.3 If Building New Relationship Features

**Potential enhancements** (from docs):
- [ ] Vector search for semantic relationship queries
- [ ] Relationship strength scoring (frequency + confidence)
- [ ] Temporal decay for old relationships
- [ ] Sub-graph extraction around center entity
- [ ] Relationship clustering and pattern detection

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Data Sources                            │
│  Gmail  │  Calendar  │  Contacts  │  Drive (future)            │
└────┬────────┬──────────────┬───────────────────────────────────┘
     │        │              │
     ▼        ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Entity Extraction (LLM)                            │
│  - Person, Company, Project, Topic, Location, Action Items     │
│  - Stored in Weaviate Collections                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           Relationship Inference (LLM)                          │
│  - Groups entities by sourceId                                  │
│  - Analyzes co-occurrence + context                             │
│  - Validates relationship type constraints                      │
│  - Assigns confidence scores + evidence                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           Weaviate Storage (Relationship Collection)            │
│  - fromEntity → toEntity with type                              │
│  - Confidence, evidence, sourceId, userId                       │
│  - Deduplication on insert                                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Layer                                    │
│  /api/relationships   (CRUD + query)                            │
│  /api/relationships/bulk-infer                                  │
│  /api/relationships/graph                                       │
│  /api/relationships/stats                                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│               Dashboard Visualization                           │
│  /dashboard/relationships                                       │
│  - Interactive force-directed graph                             │
│  - Filtering and search                                         │
│  - Node/edge details panel                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Related Files

| File | Purpose |
|------|---------|
| `src/lib/relationships/types.ts` | Type definitions |
| `src/lib/relationships/inference.ts` | LLM inference logic |
| `src/lib/weaviate/relationships.ts` | Storage layer |
| `src/lib/weaviate/schema.ts` | Collection schemas |
| `src/app/api/relationships/route.ts` | Main API endpoint |
| `src/app/api/relationships/bulk-infer/route.ts` | Bulk inference |
| `src/app/api/relationships/graph/route.ts` | Graph data |
| `src/app/api/relationships/stats/route.ts` | Statistics |
| `src/app/dashboard/relationships/page.tsx` | Dashboard UI |
| `src/lib/graph/types.ts` | Neo4j graph types (alternative) |
| `docs/weaviate-relationship-storage.md` | Documentation |

---

## 10. Conclusion

**The "build relationships" request likely means one of:**

1. **Run inference**: Execute bulk relationship inference on existing entities
2. **View relationships**: Navigate to `/dashboard/relationships` to explore
3. **Enhance inference**: Add new data sources or relationship types
4. **Fix issues**: Debug why relationships aren't being created

**Next step**: Ask user to clarify which action they need.
