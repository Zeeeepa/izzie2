# Neo4j Database Status Report

**Date:** 2026-01-17
**Project:** Izzie2
**Database:** Neo4j Graph Database

---

## Summary

❌ **Neo4j is NOT configured or running**

The project has full Neo4j integration code but no database instance is configured. Entities cannot be stored or queried until Neo4j is set up.

---

## Current Status

### 1. Configuration Status

**Environment Variables (.env.local):**
- ❌ `NEO4J_URI` - NOT SET
- ❌ `NEO4J_USER` - NOT SET
- ❌ `NEO4J_PASSWORD` - NOT SET

**Required for Neo4j connection:**
```bash
NEO4J_URI=bolt://localhost:7687  # or Neo4j Aura cloud URI
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your-password>
```

### 2. Database Status

- **Running:** ❌ No (Docker daemon not running, no cloud instance configured)
- **Connected:** ❌ Cannot connect (credentials not set)
- **Entity Count:** Unknown (database not accessible)

### 3. Code Integration Status

✅ **Neo4j integration is fully implemented:**

- **Driver:** `neo4j-driver@6.0.1` installed
- **Client:** `/Users/masa/Projects/izzie2/src/lib/graph/neo4j-client.ts`
- **Graph Builder:** `/Users/masa/Projects/izzie2/src/lib/graph/graph-builder.ts`
- **Query Library:** `/Users/masa/Projects/izzie2/src/lib/graph/graph-queries.ts`
- **API Endpoints:**
  - `GET /api/graph/test` - Test Neo4j connection
  - `POST /api/graph/build` - Build graph from extractions
  - `GET /api/graph/build` - Get graph statistics

---

## Graph Schema Overview

When Neo4j is running, the system will create the following graph structure:

### Node Types

| Type | Description | Key Properties |
|------|-------------|----------------|
| **Person** | People mentioned in emails | normalized, email, frequency |
| **Company** | Organizations | normalized, domain, frequency |
| **Project** | Projects or initiatives | normalized, status, frequency |
| **Topic** | Discussion topics | normalized, category, frequency |
| **Location** | Places mentioned | normalized, type, frequency |
| **Email** | Email messages | id, subject, timestamp, significanceScore |

### Relationship Types

| Type | From → To | Description |
|------|-----------|-------------|
| **MENTIONED_IN** | Entity → Email | Entity appears in email |
| **WORKS_WITH** | Person → Person | People collaborate |
| **DISCUSSED_TOPIC** | Person → Topic | Person discusses topic |
| **COLLABORATES_ON** | Person → Project | Person works on project |
| **WORKS_FOR** | Person → Company | Employment relationship |
| **RELATED_TO** | Topic → Topic | Topics are related |
| **LOCATED_AT** | Entity → Location | Entity at location |

---

## Setup Options

### Option 1: Local Neo4j with Docker (Recommended for Development)

**Start Neo4j container:**
```bash
docker run -d \
  -p 7687:7687 \
  -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/password \
  --name neo4j \
  neo4j:latest
```

**Add to .env.local:**
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

**Access Neo4j Browser:**
- URL: http://localhost:7474
- Username: neo4j
- Password: password

### Option 2: Neo4j Aura Free Tier (Recommended for Production)

**Features:**
- Free tier: 200MB storage, 1GB RAM
- Fully managed cloud service
- SSL/TLS encryption
- Automatic backups

**Setup:**
1. Visit: https://neo4j.com/cloud/aura-free/
2. Create free account
3. Create new database instance
4. Copy connection URI, username, and password
5. Add to `.env.local`:

```bash
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxxxx
```

---

## Verification Steps

### 1. Check Neo4j Configuration

```bash
npx tsx scripts/check-neo4j-entities.ts
```

This script will:
- ✅ Verify environment variables are set
- ✅ Test database connection
- ✅ Show entity counts by type
- ✅ Display sample entities
- ✅ Show relationship statistics

### 2. Test via API Endpoint

```bash
curl http://localhost:3300/api/graph/test
```

Expected response when working:
```json
{
  "status": "success",
  "checks": {
    "configured": true,
    "connected": true,
    "initialized": true,
    "nodeCreation": true,
    "query": true,
    "relationships": true,
    "stats": true,
    "topEntities": true
  },
  "summary": {
    "passed": 8,
    "total": 8,
    "percentage": 100
  }
}
```

### 3. Build Graph from Test Data

```bash
curl -X POST http://localhost:3300/api/graph/build \
  -H "Content-Type: application/json" \
  -d '{"mode": "test"}'
```

This will:
- Extract entities from sample emails
- Create nodes in Neo4j
- Create relationships between entities
- Return graph statistics

---

## Entity Extraction Integration

Once Neo4j is configured, entities extracted from emails will be automatically stored in the graph:

### Current Extraction Flow

1. **Email Ingestion** → Gmail API sync
2. **Entity Extraction** → LLM extracts entities (people, companies, etc.)
3. **Graph Building** → Entities stored in Neo4j ⬅️ **REQUIRES NEO4J**
4. **Querying** → Search and relationship queries

### Expected Data Volume

Based on project structure:
- **Emails:** Extracted from Gmail (count unknown)
- **Entities:** Depends on email volume and extraction
- **Relationships:** Co-occurrences and connections

---

## What You Can Do Once Neo4j is Running

### Query Examples

**Find people you work with most:**
```typescript
import { getWorksWith } from '@/lib/graph';
const colleagues = await getWorksWith('john_doe', 10);
```

**Find project collaborators:**
```typescript
import { getProjectCollaborators } from '@/lib/graph';
const team = await getProjectCollaborators('project_apollo', 20);
```

**Find topic experts:**
```typescript
import { getTopicExperts } from '@/lib/graph';
const experts = await getTopicExperts('ai_research', 10);
```

**Get graph statistics:**
```typescript
import { neo4jClient } from '@/lib/graph';
const stats = await neo4jClient.getStats();
console.log(stats);
// {
//   nodeCount: 1234,
//   relationshipCount: 5678,
//   nodesByType: { Person: 450, Company: 123, ... },
//   relationshipsByType: { WORKS_WITH: 890, ... }
// }
```

---

## Troubleshooting

### Issue: "Cannot connect to Docker daemon"

**Cause:** Docker is not running
**Solution:** Start Docker Desktop or install Docker

### Issue: "Neo4j not configured"

**Cause:** Environment variables not set
**Solution:** Add NEO4J_* variables to `.env.local`

### Issue: "Connection failed: ServiceUnavailable"

**Cause:** Neo4j server not running
**Solution:** Start Neo4j container or verify Aura instance is running

### Issue: "Authentication failed"

**Cause:** Wrong username/password
**Solution:** Verify NEO4J_USER and NEO4J_PASSWORD match your instance

---

## Next Steps

1. **Choose setup option:**
   - Docker for local dev (easiest)
   - Neo4j Aura for production (managed)

2. **Configure environment:**
   - Add NEO4J_* variables to `.env.local`

3. **Verify connection:**
   ```bash
   npx tsx scripts/check-neo4j-entities.ts
   ```

4. **Test with sample data:**
   ```bash
   curl -X POST http://localhost:3300/api/graph/build -H "Content-Type: application/json" -d '{"mode": "test"}'
   ```

5. **Extract real data:**
   - Run email extraction
   - Build graph from extraction results

---

## Additional Resources

- **Neo4j Documentation:** https://neo4j.com/docs/
- **Neo4j Browser Guide:** https://neo4j.com/developer/neo4j-browser/
- **Cypher Query Language:** https://neo4j.com/docs/cypher-manual/current/
- **Neo4j Aura:** https://neo4j.com/cloud/aura-free/
- **Project Graph Module:** `/Users/masa/Projects/izzie2/src/lib/graph/README.md`

---

## Files Created

- **Check Script:** `/Users/masa/Projects/izzie2/scripts/check-neo4j-entities.ts`
  - Run with: `npx tsx scripts/check-neo4j-entities.ts`
  - Shows database status, entity counts, and samples
