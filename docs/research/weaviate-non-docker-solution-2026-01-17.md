# Weaviate as Non-Docker Solution for Entity/Vector Storage

**Date**: 2026-01-17
**Research Focus**: Weaviate Cloud Services as cloud-hosted alternative to Neo4j for entity storage
**Status**: Feasibility Analysis Complete

---

## Executive Summary

**Current State**: The project currently uses Neo4j (`neo4j-driver@6.0.1`) for entity storage, but no active Neo4j code exists in the codebase.

**Recommendation**: ✅ **Weaviate Cloud Services (WCS) is an excellent non-Docker solution** for entity/vector storage in this project.

**Key Advantages**:
- ✅ Free sandbox tier available (no Docker required)
- ✅ Cloud-hosted with 1-3 minute provisioning
- ✅ Native vector search capabilities (better than Neo4j for embeddings)
- ✅ TypeScript client with full type safety
- ✅ Horizontal scaling for large datasets
- ✅ Hybrid search (BM25 keyword + vector semantic search)

**Migration Complexity**: **Low** - No existing graph database code to migrate

---

## 1. Current Project Status

### Neo4j Integration Analysis

**Package Dependencies**:
```json
{
  "neo4j-driver": "^6.0.1"  // ❌ Installed but NOT used
}
```

**Codebase Search Results**:
- ❌ No Neo4j imports found in `src/**/*.ts`
- ❌ No graph database code in codebase
- ❌ No entity storage layer implemented
- ✅ Clean slate for implementing new solution

**Conclusion**: The project is **ready for Weaviate integration** without migration overhead.

---

## 2. Weaviate Cloud Services (WCS) Overview

### What is Weaviate?

Weaviate is a purpose-built vector database designed for:
- **Semantic search** on high-dimensional embeddings
- **Multi-modal data** (text, images, audio, video)
- **Hybrid search** combining keyword (BM25) and vector similarity
- **Graph-like relationships** via cross-references
- **Horizontal scaling** to billions of vectors

### Weaviate vs Neo4j Comparison

| Feature | Weaviate | Neo4j |
|---------|----------|-------|
| **Primary Purpose** | Vector database | Graph database |
| **Vector Search** | Native HNSW indexing | Add-on (since v5.18) |
| **Scalability** | Billions of vectors | Struggles past 100M nodes |
| **Embeddings** | First-class citizen | Extension feature |
| **Hosting Options** | Cloud-native (WCS) | Requires infrastructure |
| **Free Tier** | Sandbox clusters (cloud) | Local Docker only |
| **TypeScript Support** | Official `weaviate-client@3.10.0` | `neo4j-driver` |
| **Use Case Fit** | Entity embeddings, semantic search | Complex graph traversal |

**Sources**:
- [Weaviate vs Neo4j Comparison (Zilliz)](https://zilliz.com/blog/weaviate-vs-neo4j-a-comprehensive-vector-database-comparison)
- [Neo4j vs Weaviate (DB-Engines)](https://db-engines.com/en/system/Neo4j%3BWeaviate)

### When to Use Weaviate

✅ **Choose Weaviate when**:
- Storing entities with vector embeddings (Person, Organization, Event)
- Semantic similarity search is priority
- You want modular, scalable architecture
- Need cloud-hosted solution without Docker
- Working with multi-modal data (text + metadata)

❌ **Choose Neo4j when**:
- Complex graph traversal algorithms (shortest path, PageRank)
- Relationships are more important than content similarity
- Data is naturally a network (social graph, knowledge graph)

**For this project**: Entity extraction from Gmail → **Weaviate is the better choice**

---

## 3. Weaviate Cloud Services Setup

### Step 1: Create Weaviate Cloud Account

1. **Go to Weaviate Cloud Console**: https://console.weaviate.cloud/
2. **Sign up** with email or OAuth provider
3. **Log in** to manage clusters

**Sources**:
- [Create Account and Sign In (Weaviate Docs)](https://weaviate.io/developers/wcs/platform/create-account)
- [Weaviate Cloud Console](https://console.weaviate.cloud/)

### Step 2: Create Free Sandbox Cluster

1. **Click** the plus button in clusters sidebar
2. **Select** "Sandbox" option (free tier)
3. **Choose** a cluster name (e.g., `izzie2-entities`)
4. **Select** cloud provider (GCP by default)
5. **Click** "Create cluster"

**Provisioning Time**: 1-3 minutes
**Limit**: Up to 2 sandbox clusters per organization
**Persistence**: Sandbox clusters are ephemeral (not for production)

**Sources**:
- [Create a Cluster (Weaviate Docs)](https://docs.weaviate.io/cloud/manage-clusters/create)
- [Weaviate Cloud Quickstart](https://docs.weaviate.io/cloud/quickstart)

### Step 3: Get Credentials

After cluster creation, retrieve:

1. **REST Endpoint URL** (e.g., `https://your-cluster.weaviate.network`)
2. **Administrator API Key** (from WCD console)

⚠️ **RBAC Note**: Clusters with Weaviate v1.30+ have RBAC enabled by default. You'll need to create an API key yourself and assign it a role (admin/viewer/custom).

**Environment Variables** (add to `.env.local`):
```bash
WEAVIATE_URL=https://your-cluster.weaviate.network
WEAVIATE_API_KEY=your-admin-api-key
```

**Sources**:
- [Weaviate Cloud Quickstart](https://docs.weaviate.io/cloud/quickstart)

---

## 4. TypeScript Client Integration

### Step 1: Install Weaviate Client

```bash
npm install weaviate-client
```

**Package**: `weaviate-client@3.10.0` (latest as of 2026-01-17)
**Requirements**: Node.js v18+
**Module System**: ES Modules (not CommonJS)

### Step 2: TypeScript Configuration

Update `tsconfig.json` if not already configured:

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}
```

**Sources**:
- [JavaScript and TypeScript Client (Weaviate Docs)](https://docs.weaviate.io/weaviate/client-libraries/typescript)
- [weaviate-client npm package](https://www.npmjs.com/package/weaviate-client)

### Step 3: Initialize Client

Create `src/lib/weaviate/client.ts`:

```typescript
import weaviate, { WeaviateClient } from 'weaviate-client';

let client: WeaviateClient | null = null;

export async function getWeaviateClient(): Promise<WeaviateClient> {
  if (client) return client;

  if (!process.env.WEAVIATE_URL || !process.env.WEAVIATE_API_KEY) {
    throw new Error('Missing WEAVIATE_URL or WEAVIATE_API_KEY environment variables');
  }

  client = await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_URL,
    {
      apiKey: process.env.WEAVIATE_API_KEY,
      headers: {
        'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY || '', // Optional: for vectorization
      },
    }
  );

  console.log('[Weaviate] Connected to cluster:', process.env.WEAVIATE_URL);
  return client;
}
```

**Sources**:
- [Weaviate TypeScript Client GitHub](https://github.com/weaviate/typescript-client)

---

## 5. Entity Schema Design

### Entity Types for Gmail Extraction

Based on the project's entity extraction needs:

1. **Person** - Email senders, recipients, mentioned individuals
2. **Organization** - Companies, teams, groups
3. **Event** - Meetings, deadlines, appointments
4. **Document** - Attachments, files, links
5. **Topic** - Keywords, categories, themes

### Weaviate Collection Schema

Create `src/lib/weaviate/schema.ts`:

```typescript
import weaviate from 'weaviate-client';
import { getWeaviateClient } from './client';

export async function createEntitySchema() {
  const client = await getWeaviateClient();

  // 1. Person Collection
  await client.collections.create({
    name: 'Person',
    description: 'People mentioned in emails, calendar, documents',
    vectorizerConfig: weaviate.configure.vectorizer.text2vecOpenai(), // Optional: auto-vectorize
    vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({
      distanceMetric: weaviate.configure.vectorDistances.COSINE,
    }),
    properties: [
      {
        name: 'name',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Full name of the person',
      },
      {
        name: 'email',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Email address',
      },
      {
        name: 'source',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Data source (gmail, calendar, drive)',
      },
      {
        name: 'extractedAt',
        dataType: weaviate.configure.dataType.DATE,
        description: 'When entity was extracted',
      },
      {
        name: 'userId',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'User who owns this data',
      },
    ],
  });

  // 2. Organization Collection
  await client.collections.create({
    name: 'Organization',
    description: 'Companies, teams, groups',
    vectorizerConfig: weaviate.configure.vectorizer.text2vecOpenai(),
    vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({
      distanceMetric: weaviate.configure.vectorDistances.COSINE,
    }),
    properties: [
      {
        name: 'name',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Organization name',
      },
      {
        name: 'domain',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Email domain or website',
      },
      {
        name: 'source',
        dataType: weaviate.configure.dataType.TEXT,
      },
      {
        name: 'extractedAt',
        dataType: weaviate.configure.dataType.DATE,
      },
      {
        name: 'userId',
        dataType: weaviate.configure.dataType.TEXT,
      },
    ],
  });

  // 3. Event Collection
  await client.collections.create({
    name: 'Event',
    description: 'Meetings, deadlines, appointments',
    vectorizerConfig: weaviate.configure.vectorizer.text2vecOpenai(),
    vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({
      distanceMetric: weaviate.configure.vectorDistances.COSINE,
    }),
    properties: [
      {
        name: 'title',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Event title',
      },
      {
        name: 'description',
        dataType: weaviate.configure.dataType.TEXT,
        description: 'Event details',
      },
      {
        name: 'startDate',
        dataType: weaviate.configure.dataType.DATE,
        description: 'Event start time',
      },
      {
        name: 'endDate',
        dataType: weaviate.configure.dataType.DATE,
        description: 'Event end time',
      },
      {
        name: 'source',
        dataType: weaviate.configure.dataType.TEXT,
      },
      {
        name: 'extractedAt',
        dataType: weaviate.configure.dataType.DATE,
      },
      {
        name: 'userId',
        dataType: weaviate.configure.dataType.TEXT,
      },
    ],
  });

  console.log('[Weaviate] Entity schema created successfully');
}
```

**Sources**:
- [Weaviate TypeScript Client Beta Announcement](https://weaviate.io/blog/typescript-client-beta)
- [Weaviate Schema Examples](https://github.com/daandegroot123/weaviate-typescript-example)

---

## 6. Entity Storage and Retrieval

### Storing Extracted Entities

Create `src/lib/weaviate/entities.ts`:

```typescript
import { getWeaviateClient } from './client';

export async function storePerson(person: {
  name: string;
  email: string;
  source: string;
  userId: string;
}) {
  const client = await getWeaviateClient();
  const personCollection = client.collections.get('Person');

  const result = await personCollection.data.insert({
    name: person.name,
    email: person.email,
    source: person.source,
    extractedAt: new Date(),
    userId: person.userId,
  });

  console.log('[Weaviate] Stored person:', result.id);
  return result;
}

export async function storeOrganization(org: {
  name: string;
  domain?: string;
  source: string;
  userId: string;
}) {
  const client = await getWeaviateClient();
  const orgCollection = client.collections.get('Organization');

  const result = await orgCollection.data.insert({
    name: org.name,
    domain: org.domain || '',
    source: org.source,
    extractedAt: new Date(),
    userId: org.userId,
  });

  console.log('[Weaviate] Stored organization:', result.id);
  return result;
}

export async function storeEvent(event: {
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  source: string;
  userId: string;
}) {
  const client = await getWeaviateClient();
  const eventCollection = client.collections.get('Event');

  const result = await eventCollection.data.insert({
    title: event.title,
    description: event.description || '',
    startDate: event.startDate,
    endDate: event.endDate,
    source: event.source,
    extractedAt: new Date(),
    userId: event.userId,
  });

  console.log('[Weaviate] Stored event:', result.id);
  return result;
}
```

### Searching Entities

```typescript
export async function searchPeople(query: string, userId: string, limit = 10) {
  const client = await getWeaviateClient();
  const personCollection = client.collections.get('Person');

  // Hybrid search: BM25 keyword + vector semantic search
  const results = await personCollection.query.hybrid(query, {
    limit,
    filters: personCollection.filter.byProperty('userId').equal(userId),
  });

  return results.objects;
}

export async function searchOrganizations(query: string, userId: string, limit = 10) {
  const client = await getWeaviateClient();
  const orgCollection = client.collections.get('Organization');

  const results = await orgCollection.query.hybrid(query, {
    limit,
    filters: orgCollection.filter.byProperty('userId').equal(userId),
  });

  return results.objects;
}

export async function searchEvents(query: string, userId: string, limit = 10) {
  const client = await getWeaviateClient();
  const eventCollection = client.collections.get('Event');

  const results = await eventCollection.query.hybrid(query, {
    limit,
    filters: eventCollection.filter.byProperty('userId').equal(userId),
  });

  return results.objects;
}
```

---

## 7. Integration with Gmail Extraction

### Modify Entity Extraction Pipeline

Update the existing Gmail sync flow (from `docs/research/inngest-gmail-extraction-architecture-2026-01-08.md`):

**Current Flow**:
```
Gmail API → Extract Entities → ??? (No storage layer)
```

**New Flow with Weaviate**:
```
Gmail API → Extract Entities → Store in Weaviate → Enable Semantic Search
```

**Implementation**:

1. **Update `/api/gmail/sync-user/route.ts`**:

```typescript
import { storePerson, storeOrganization, storeEvent } from '@/lib/weaviate/entities';

// After extracting entities from email
async function processExtractedEntities(
  extractionResult: { entities: any[]; relationships: any[] },
  userId: string
) {
  for (const entity of extractionResult.entities) {
    if (entity.type === 'Person') {
      await storePerson({
        name: entity.name,
        email: entity.email || '',
        source: 'gmail',
        userId,
      });
    } else if (entity.type === 'Organization') {
      await storeOrganization({
        name: entity.name,
        domain: entity.domain,
        source: 'gmail',
        userId,
      });
    } else if (entity.type === 'Event') {
      await storeEvent({
        title: entity.title,
        description: entity.description,
        startDate: new Date(entity.startDate),
        endDate: entity.endDate ? new Date(entity.endDate) : undefined,
        source: 'gmail',
        userId,
      });
    }
  }
}
```

2. **Create Entity Search API**:

Create `src/app/api/entities/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { searchPeople, searchOrganizations, searchEvents } from '@/lib/weaviate/entities';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const type = searchParams.get('type') || 'all';

    let results: any = {};

    if (type === 'all' || type === 'person') {
      results.people = await searchPeople(query, session.userId);
    }

    if (type === 'all' || type === 'organization') {
      results.organizations = await searchOrganizations(query, session.userId);
    }

    if (type === 'all' || type === 'event') {
      results.events = await searchEvents(query, session.userId);
    }

    return NextResponse.json({
      success: true,
      query,
      results,
    });
  } catch (error) {
    console.error('[Entity Search] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search entities' },
      { status: 500 }
    );
  }
}
```

---

## 8. Migration from Neo4j (If Needed)

### Current Status

✅ **No migration needed** - Neo4j is installed but not used in the codebase.

### Steps if Neo4j Code Existed

If there were existing Neo4j code, migration would involve:

1. **Export data from Neo4j**:
   ```cypher
   MATCH (n) RETURN n
   ```

2. **Transform to Weaviate schema**:
   ```typescript
   // Convert Neo4j nodes to Weaviate objects
   for (const node of neo4jNodes) {
     await storeEntity(transformNode(node));
   }
   ```

3. **Handle relationships**:
   - Neo4j uses graph edges
   - Weaviate uses cross-references or metadata fields

4. **Update queries**:
   - Neo4j Cypher → Weaviate TypeScript API
   - Graph traversal → Vector similarity search

### Package Cleanup

Since Neo4j is not used, **remove it**:

```bash
npm uninstall neo4j-driver
```

Update `package.json` dependencies (remove line 75):
```diff
- "neo4j-driver": "^6.0.1",
```

---

## 9. Cost Analysis

### Weaviate Cloud Pricing

**Free Tier (Sandbox)**:
- ✅ 2 sandbox clusters per organization
- ✅ Suitable for development and testing
- ❌ Ephemeral (not persistent for production)
- ✅ No credit card required

**Paid Tiers** (for production):
- **Serverless**: Pay-as-you-go ($0.15/1M vectors stored)
- **Dedicated**: Fixed pricing for guaranteed resources

**Sources**:
- [Weaviate Pricing](https://weaviate.io/pricing)
- [Weaviate Billing Docs](https://docs.weaviate.io/cloud/platform/billing)

### Neo4j Pricing (for comparison)

**Free Options**:
- ❌ Docker only (local development)
- ❌ No cloud-hosted free tier

**Paid Cloud** (Neo4j Aura):
- Starts at $65/month for minimal instance

**Conclusion**: **Weaviate is more cost-effective** for cloud-hosted vector storage.

---

## 10. Implementation Checklist

### Quick Setup (30 minutes)

- [ ] **Step 1**: Sign up at https://console.weaviate.cloud/
- [ ] **Step 2**: Create sandbox cluster (takes 1-3 min)
- [ ] **Step 3**: Get REST Endpoint URL and API Key
- [ ] **Step 4**: Add to `.env.local`:
  ```bash
  WEAVIATE_URL=https://your-cluster.weaviate.network
  WEAVIATE_API_KEY=your-admin-api-key
  ```
- [ ] **Step 5**: Install client: `npm install weaviate-client`
- [ ] **Step 6**: Create `src/lib/weaviate/client.ts`
- [ ] **Step 7**: Create `src/lib/weaviate/schema.ts`
- [ ] **Step 8**: Create `src/lib/weaviate/entities.ts`
- [ ] **Step 9**: Update Gmail extraction to store entities
- [ ] **Step 10**: Test with sample data

### Verification Steps

```bash
# 1. Test Weaviate connection
npm run dev
curl http://localhost:3300/api/test/weaviate-health

# 2. Create schema
curl -X POST http://localhost:3300/api/weaviate/setup-schema

# 3. Extract Gmail entities (will auto-store in Weaviate)
curl -X POST http://localhost:3300/api/gmail/sync-user \
  -H "Cookie: izzie2.session_token=YOUR_TOKEN" \
  -d '{"folder": "sent", "maxResults": 10}'

# 4. Search entities
curl "http://localhost:3300/api/entities/search?query=john&type=person" \
  -H "Cookie: izzie2.session_token=YOUR_TOKEN"
```

---

## 11. Advantages of Weaviate for This Project

### Technical Advantages

1. **✅ Native Vector Search**
   - HNSW indexing for fast similarity search
   - Scales to billions of vectors
   - Better performance than Neo4j for embeddings

2. **✅ Cloud-Hosted (No Docker)**
   - WCS manages infrastructure
   - 1-3 minute provisioning
   - Automatic scaling and backups

3. **✅ Hybrid Search**
   - Combines BM25 (keyword) + vector (semantic) search
   - Best of both worlds for entity retrieval

4. **✅ TypeScript-First**
   - Full type safety with `weaviate-client`
   - IDE autocomplete and validation
   - ES Modules support

5. **✅ Multi-Modal Data**
   - Store text, images, audio, video
   - Unified entity representation

### Business Advantages

1. **💰 Cost-Effective**
   - Free sandbox for development
   - Pay-as-you-go for production
   - No infrastructure management overhead

2. **🚀 Fast Time-to-Value**
   - 30-minute setup
   - No Docker configuration
   - Production-ready from day 1

3. **📈 Scalable**
   - Horizontal scaling built-in
   - No performance degradation with growth
   - Supports millions of entities

---

## 12. Potential Challenges

### Challenge 1: Relationship Modeling

**Issue**: Neo4j excels at complex graph traversal, Weaviate uses cross-references.

**Solution**:
- Use Weaviate cross-references for simple relationships
- Store relationship metadata as properties
- Use vector similarity for implicit relationships

**Example**:
```typescript
// Neo4j-style relationship
MATCH (p:Person)-[:WORKS_AT]->(o:Organization)

// Weaviate equivalent
await personCollection.data.insert({
  name: 'John Doe',
  worksAt: 'ACME Corp', // Simple reference
  // Or use cross-reference:
  organization: weaviate.reference('Organization', orgId),
});
```

### Challenge 2: Learning Curve

**Issue**: Team may be more familiar with Neo4j Cypher than Weaviate API.

**Solution**:
- Comprehensive TypeScript client with type safety
- Excellent documentation at https://docs.weaviate.io
- Active community Slack and forums

### Challenge 3: Sandbox Limitations

**Issue**: Free sandbox clusters are ephemeral (not persistent).

**Solution**:
- Use sandbox for development/testing
- Migrate to Serverless tier ($0.15/1M vectors) for production
- Export/import data with Weaviate backup tools

---

## 13. Recommendations

### Immediate Actions

1. **✅ Remove Neo4j dependency** (not being used):
   ```bash
   npm uninstall neo4j-driver
   ```

2. **✅ Set up Weaviate Cloud sandbox** (free, 5 minutes):
   - Sign up at https://console.weaviate.cloud/
   - Create sandbox cluster
   - Get credentials

3. **✅ Install Weaviate client**:
   ```bash
   npm install weaviate-client
   ```

4. **✅ Implement entity storage layer**:
   - Create `src/lib/weaviate/` directory
   - Implement schema, client, and entity functions
   - Integrate with Gmail extraction pipeline

### Long-Term Strategy

**Phase 1: Development (Free Sandbox)**
- Use WCS sandbox for testing entity extraction
- Validate schema and query patterns
- Prototype semantic search features

**Phase 2: Production (Serverless)**
- Migrate to Weaviate Serverless tier
- Enable persistent storage
- Set up monitoring and alerting

**Phase 3: Optimization**
- Fine-tune vector indexing parameters
- Optimize query patterns
- Implement caching layer

---

## 14. Alternative Solutions Considered

### Alternative 1: Keep Neo4j (Local Docker)

**Pros**:
- Already in package.json
- Good for complex graph queries

**Cons**:
- ❌ Requires Docker (user wants non-Docker)
- ❌ Poor vector search performance
- ❌ No free cloud hosting
- ❌ Not optimized for embeddings

**Verdict**: ❌ Rejected due to Docker requirement

### Alternative 2: Pinecone

**Pros**:
- Purpose-built for vector search
- Excellent performance
- Managed cloud service

**Cons**:
- ❌ Free tier limited (1 index, 1M vectors)
- ❌ No graph/relationship modeling
- ❌ Vendor lock-in

**Verdict**: ⚠️ Good for pure vector search, but lacks entity relationship features

### Alternative 3: Qdrant

**Pros**:
- Open-source vector database
- Good performance
- Self-hosted or cloud

**Cons**:
- ❌ Smaller community than Weaviate
- ❌ Less mature TypeScript client
- ❌ Self-hosting requires infrastructure

**Verdict**: ⚠️ Viable alternative, but Weaviate has better cloud offering

### Alternative 4: PostgreSQL + pgvector

**Pros**:
- Already using PostgreSQL (via Neon)
- pgvector extension for embeddings
- No additional services needed

**Cons**:
- ❌ Poor performance past 1M vectors
- ❌ No hybrid search (BM25 + vector)
- ❌ Limited scalability

**Verdict**: ⚠️ Good for small datasets (<1M vectors), limited beyond that

---

## 15. Summary

### Why Weaviate Cloud Services?

✅ **Perfect fit for this project**:
- Non-Docker cloud-hosted solution (meets requirement)
- No existing graph database code to migrate (clean slate)
- Native vector search for entity embeddings
- Free sandbox tier for development
- Production-ready with minimal configuration

### Migration Complexity

**Effort**: **Low** (< 1 day)
- No Neo4j code to migrate
- Simple schema creation
- TypeScript client with full type safety
- Drop-in integration with Gmail extraction

### Next Steps

1. **Today**: Sign up for WCS, create sandbox cluster
2. **This week**: Implement entity storage layer
3. **Next week**: Integrate with Gmail extraction pipeline
4. **Future**: Migrate to production Serverless tier

---

## References and Sources

### Documentation
- [Weaviate Cloud Services Documentation](https://docs.weaviate.io/cloud)
- [JavaScript/TypeScript Client Documentation](https://docs.weaviate.io/weaviate/client-libraries/typescript)
- [Weaviate Quickstart Guide](https://docs.weaviate.io/cloud/quickstart)
- [Create Cluster Guide](https://docs.weaviate.io/cloud/manage-clusters/create)

### Comparisons
- [Weaviate vs Neo4j Comparison (Zilliz)](https://zilliz.com/blog/weaviate-vs-neo4j-a-comprehensive-vector-database-comparison)
- [Vector Database Comparison for AI Developers (Medium)](https://medium.com/@felix-pappe/vector-database-comparison-for-ai-developers-90aeb3d79caf)
- [Neo4j vs Weaviate (DB-Engines)](https://db-engines.com/en/system/Neo4j%3BWeaviate)

### Code Examples
- [Weaviate TypeScript Client GitHub](https://github.com/weaviate/typescript-client)
- [Weaviate TypeScript Examples](https://github.com/daandegroot123/weaviate-typescript-example)
- [weaviate-client npm package](https://www.npmjs.com/package/weaviate-client)

### Pricing
- [Weaviate Pricing](https://weaviate.io/pricing)
- [Weaviate Billing Documentation](https://docs.weaviate.io/cloud/platform/billing)

---

**Research Complete**: 2026-01-17

**Recommendation**: ✅ **Proceed with Weaviate Cloud Services** as non-Docker entity storage solution.

**Implementation Time**: 30 minutes to 1 day (depending on schema complexity)

**Risk Level**: **Low** - No existing code to migrate, cloud-hosted infrastructure, free tier available
