# Relationship Graphing REST API

Complete REST API for the relationship inference and graph visualization system.

## Endpoints

### 1. **GET /api/relationships**
List relationships with optional filtering.

**Query Parameters:**
- `entityType` (optional): Filter by entity type (person, company, project, topic, location)
- `entityValue` (optional): Filter by entity value (requires entityType)
- `relationshipType` (optional): Filter by relationship type (WORKS_WITH, REPORTS_TO, etc.)
- `limit` (optional): Max results (default: 100, max: 1000)

**Response:**
```json
{
  "relationships": [
    {
      "id": "uuid",
      "fromEntityType": "person",
      "fromEntityValue": "john smith",
      "toEntityType": "company",
      "toEntityValue": "acme corp",
      "relationshipType": "WORKS_FOR",
      "confidence": 0.9,
      "evidence": "John mentioned he joined Acme Corp last month",
      "sourceId": "email-123",
      "userId": "user-456",
      "inferredAt": "2025-01-18T12:00:00Z"
    }
  ],
  "total": 1
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/relationships?entityType=person&entityValue=john%20smith&limit=50" \
  -H "Authorization: Bearer <token>"
```

---

### 2. **POST /api/relationships**
Infer and save relationships from entities.

**Request Body:**
```json
{
  "sourceId": "email-123",
  "content": "John Smith joined Acme Corp as VP of Engineering...",
  "entities": [
    { "type": "person", "value": "John Smith", "normalized": "john smith" },
    { "type": "company", "value": "Acme Corp", "normalized": "acme corp" }
  ]
}
```

**Response:**
```json
{
  "relationships": [...],
  "count": 5,
  "processingTime": 1234,
  "tokenCost": 0.0025
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/relationships" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "sourceId": "email-123",
    "content": "John works at Acme Corp...",
    "entities": [{"type": "person", "value": "John Smith"}]
  }'
```

---

### 3. **GET /api/relationships/graph**
Build graph visualization data.

**Query Parameters:**
- `entityType` (optional): Center graph on specific entity type
- `entityValue` (optional): Center graph on specific entity value (requires entityType)
- `depth` (optional): Max depth for graph traversal (default: 2, max: 5)
- `limit` (optional): Max nodes to return (default: 50, max: 200)
- `minConfidence` (optional): Minimum confidence threshold (default: 0.5)

**Response:**
```json
{
  "nodes": [
    {
      "id": "person:john smith",
      "label": "john smith",
      "type": "person",
      "color": "#3b82f6",
      "size": 2.5
    }
  ],
  "edges": [
    {
      "source": "person:john smith",
      "target": "company:acme corp",
      "type": "WORKS_FOR",
      "weight": 0.9,
      "label": "works for"
    }
  ],
  "stats": {
    "totalNodes": 10,
    "totalEdges": 15,
    "avgConnections": 3.0
  }
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/relationships/graph?limit=100&minConfidence=0.7" \
  -H "Authorization: Bearer <token>"
```

---

### 4. **GET /api/relationships/stats**
Get relationship statistics.

**Response:**
```json
{
  "total": 150,
  "byType": {
    "WORKS_FOR": 45,
    "WORKS_WITH": 30,
    "REPORTS_TO": 20,
    "EXPERT_IN": 25,
    "LOCATED_IN": 15,
    "PARTNERS_WITH": 10,
    "OWNS": 5
  },
  "avgConfidence": 0.82
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/api/relationships/stats" \
  -H "Authorization: Bearer <token>"
```

---

### 5. **POST /api/relationships/infer**
Preview relationship inference without saving (useful for testing).

**Request Body:**
```json
{
  "sourceId": "email-123",
  "content": "Source text for context...",
  "entities": [...]
}
```

**Response:**
```json
{
  "relationships": [...],
  "count": 5,
  "processingTime": 1234,
  "tokenCost": 0.0025,
  "preview": true
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/relationships/infer" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "sourceId": "test-123",
    "content": "Preview content...",
    "entities": [...]
  }'
```

---

## Relationship Types

Valid relationship types (use exactly these):

### Person ↔ Person
- `WORKS_WITH`: Two people who work together/collaborate
- `REPORTS_TO`: Person reports to another person (hierarchy)

### Person ↔ Company
- `WORKS_FOR`: Person works for a company

### Person ↔ Project
- `LEADS`: Person leads/manages a project
- `WORKS_ON`: Person works on a project

### Person ↔ Topic
- `EXPERT_IN`: Person has expertise in a topic

### Person/Company ↔ Location
- `LOCATED_IN`: Person or company is located in a place

### Company ↔ Company
- `PARTNERS_WITH`: Two companies partner together
- `COMPETES_WITH`: Two companies compete

### Company ↔ Project
- `OWNS`: Company owns/runs a project

### Project ↔ Project
- `RELATED_TO`: Projects are related
- `DEPENDS_ON`: Project depends on another project
- `PART_OF`: Project is part of a larger project

### Topic ↔ Topic
- `SUBTOPIC_OF`: Topic is a subtopic of another
- `ASSOCIATED_WITH`: Topics are associated
- `RELATED_TO`: Topics are related

---

## Authentication

All endpoints require authentication via `requireAuth()`. Include user session token in requests.

---

## Error Handling

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

**Status Codes:**
- `200`: Success
- `400`: Bad request (missing required fields)
- `401`: Unauthorized (authentication required)
- `500`: Server error

---

## Implementation Files

- `/src/app/api/relationships/route.ts` - Main CRUD endpoints
- `/src/app/api/relationships/graph/route.ts` - Graph visualization
- `/src/app/api/relationships/stats/route.ts` - Statistics
- `/src/app/api/relationships/infer/route.ts` - Preview inference
- `/src/lib/relationships/inference.ts` - LLM inference engine
- `/src/lib/weaviate/relationships.ts` - Storage layer

---

## Graph Visualization Colors

Entity types are color-coded in graph visualization:

- Person: `#3b82f6` (blue)
- Company: `#22c55e` (green)
- Project: `#fbbf24` (yellow)
- Topic: `#a855f7` (purple)
- Location: `#ec4899` (pink)
- Action Item: `#ef4444` (red)
- Date: `#64748b` (gray)

---

## Next Steps

To integrate the relationship system:

1. **Add to Entity Extraction Pipeline**: Call `POST /api/relationships` after entity extraction
2. **Build Graph UI**: Use `GET /api/relationships/graph` with React Flow or D3.js
3. **Add Dashboard Widget**: Show stats from `GET /api/relationships/stats`
4. **Entity Detail Pages**: Show relationships from `GET /api/relationships?entityType=...&entityValue=...`

---

## Performance Notes

- Relationship inference uses Claude Haiku (fast, low-cost classifier model)
- Content is truncated to 3000 chars to minimize token costs
- Maximum 10 relationships inferred per source to control costs
- Deduplication prevents duplicate relationships across sources
- Graph visualization limits nodes to prevent UI performance issues
