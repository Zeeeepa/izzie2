# Entity Extraction and Relationship Discovery Research

**Date:** 2026-01-30
**Investigator:** Research Agent
**Status:** Complete

## Executive Summary

The Izzie2 project has a **semi-automatic** entity extraction and relationship discovery system. Extraction is triggered by scheduled cron jobs (hourly for email) or manual API calls, not by real-time webhooks. Relationships are discovered through two mechanisms: inline extraction during entity extraction and separate batch inference. The system supports Gmail, Calendar, Drive, and Tasks as data sources.

---

## 1. Entity Extraction

### Automation Level: **Semi-Automatic**

Entity extraction is NOT fully automatic. It requires triggers to initiate the process.

### Triggers

| Trigger Type | Mechanism | Source | Status |
|-------------|-----------|--------|--------|
| **Cron Job** | Inngest scheduled function (`ingest-emails`) | Gmail | Active - Hourly |
| **Cron Job** | Inngest scheduled function (`ingest-calendar`) | Calendar | Active - Configurable |
| **Cron Job** | Inngest scheduled function (`ingest-drive`) | Drive | Active - Daily at 2 AM |
| **Cron Job** | Inngest scheduled function (`ingest-tasks`) | Google Tasks | Active - Configurable |
| **Manual API** | `POST /api/extraction/start` | Email/Calendar | Active |
| **Manual API** | `POST /api/ingestion/sync-emails` | Gmail | Active |
| **Manual API** | `POST /api/ingestion/sync-drive` | Drive | Active |
| **Webhook** | `POST /api/webhooks/google` | Google Calendar | Partial - Emits events only |

### Sources Supported

1. **Gmail** (Fully Implemented)
   - Extracts from: To/From/CC metadata, subject line, body
   - Entity types: person, company, project, date, topic, location, action_item
   - Spam classification included

2. **Calendar** (Fully Implemented)
   - Extracts from: summary, description, location, attendees, organizer
   - Entity types: person, company, project, topic, location

3. **Drive** (Fully Implemented)
   - Extracts from: document content, metadata, owners
   - Has specialized `DriveEntityExtractor` with document classification
   - Supports structure analysis (headings, sections)

4. **Contacts** (Not Implemented)
   - Placeholder exists in extraction progress types
   - No implementation found

### Extraction Pipeline

```
Source (Gmail/Calendar/Drive)
    |
    v
Inngest Cron Job (scheduled) OR Manual API call
    |
    v
Fetch content via Google APIs
    |
    v
EntityExtractor.extractFromEmail/extractFromCalendarEvent
    |
    v
Mistral AI (via OpenRouter) for entity extraction
    |
    v
Emit 'izzie/ingestion.entities.extracted' event
    |
    v
update-graph Inngest function (event-triggered)
    |
    v
1. Neo4j graph update
2. Weaviate relationship storage (inline relationships)
3. Memory service update with embeddings
```

### Key Files

- `/src/lib/extraction/entity-extractor.ts` - Core extraction logic
- `/src/lib/extraction/prompts.ts` - LLM prompts for extraction
- `/src/lib/events/functions/extract-entities.ts` - Event-triggered extraction
- `/src/lib/events/functions/ingest-emails.ts` - Scheduled email ingestion
- `/src/app/api/extraction/start/route.ts` - Manual extraction trigger

---

## 2. Relationship Discovery

### Automation Level: **Semi-Automatic** (Two-Phase)

Relationships are discovered through two mechanisms:

### Phase 1: Inline Extraction (During Entity Extraction)

- Relationships are extracted **alongside entities** during the extraction process
- Uses the same Mistral AI call as entity extraction
- Extracted relationships are stored directly to Weaviate
- **Automatic** once extraction is triggered

**Relationship Types Supported (Inline):**
- WORKS_WITH, REPORTS_TO, WORKS_FOR, LEADS, WORKS_ON
- EXPERT_IN, LOCATED_IN, PARTNERS_WITH, COMPETES_WITH
- OWNS, RELATED_TO, DEPENDS_ON, PART_OF, SUBTOPIC_OF, ASSOCIATED_WITH

### Phase 2: Separate Inference (Agent-Based)

- **RelationshipDiscovererAgent** - Background agent that analyzes entity co-occurrences
- Uses `/src/lib/relationships/inference.ts` for LLM-based inference
- Groups entities by source document, runs inference on each group
- Saves to Weaviate

**Triggers for Phase 2:**
| Trigger Type | Mechanism | Status |
|-------------|-----------|--------|
| **Manual API** | `POST /api/relationships/bulk-infer` | Active |
| **Manual API** | `POST /api/relationships/infer` (preview) | Active |
| **Agent** | `RelationshipDiscovererAgent` via Inngest | Available (event-triggered) |

### Relationship Creation Logic

```typescript
// Phase 1: Inline (during extraction)
// EntityExtractor.parseExtractionResponse() validates:
1. fromType/toType are valid EntityType
2. relationshipType is in VALID_RELATIONSHIPS
3. confidence threshold met (default 0.5)

// Phase 2: Inference
// inferRelationships() validates:
1. At least 2 entities required
2. fromType/toType match VALID_RELATIONSHIPS constraints
3. Confidence threshold applied (default 0.6)
```

### Relationship Storage

- **Weaviate** - Primary storage for relationships (`RELATIONSHIP_COLLECTION`)
- Deduplication by key: `userId|fromType|fromValue|toType|toValue|relType`
- Supports graph visualization via `buildRelationshipGraph()`

### Key Files

- `/src/lib/extraction/relationship-converter.ts` - Inline to inferred conversion
- `/src/lib/relationships/inference.ts` - LLM-based relationship inference
- `/src/lib/weaviate/relationships.ts` - Relationship storage and queries
- `/src/lib/agents/implementations/relationship-discoverer.ts` - Background agent
- `/src/app/api/relationships/bulk-infer/route.ts` - Manual bulk inference

---

## 3. Current Implementation Details

### Entity Extraction Configuration

```typescript
interface ExtractionConfig {
  minConfidence: number;        // Default: 0.7
  extractFromMetadata: boolean; // Default: true
  extractFromSubject: boolean;  // Default: true
  extractFromBody: boolean;     // Default: true
  normalizeEntities: boolean;   // Default: true
}
```

### Extraction Model

- **Model:** Mistral Small via OpenRouter (MODELS.CLASSIFIER)
- **Max Tokens:** 1500
- **Temperature:** 0.1 (low for consistency)
- **Cost:** ~$0.000293/email average

### Agent Framework

Two relevant background agents exist:

1. **EntityDiscovererAgent** (`entity-discoverer`)
   - Scans emails and calendar events
   - Emits events for extraction
   - Tracks processing via cursors
   - Max concurrency: 1

2. **RelationshipDiscovererAgent** (`relationship-discoverer`)
   - Analyzes entity co-occurrences
   - Runs LLM-based inference
   - Saves to Weaviate
   - Max concurrency: 1

---

## 4. Gaps for Fully Automatic Operation

### Critical Gaps

| Gap | Description | Impact | Recommended Fix |
|-----|-------------|--------|-----------------|
| **No Real-Time Push Notifications** | Gmail Push Notifications not implemented | Extraction only happens on cron schedule | Implement Gmail Push Notifications via Pub/Sub |
| **No Calendar Watch** | Google Calendar webhook only emits events, doesn't trigger extraction | Calendar changes not automatically extracted | Connect webhook to extraction pipeline |
| **No Drive Watch** | No real-time Drive file change detection | New/modified files only caught on daily cron | Implement Drive Push Notifications |
| **Agent Scheduling** | Background agents require manual triggering or event emission | Relationship discovery not continuous | Add cron triggers for agent execution |

### Secondary Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| **Contacts Not Implemented** | No extraction from Google Contacts | Missing relationship source |
| **No Incremental Calendar Sync** | Calendar events re-fetched each time | Redundant processing |
| **Token Refresh Handling** | OAuth token refresh TODO comment in code | Potential auth failures |
| **Rate Limiting** | Simple 100ms delay between emails | Could cause issues at scale |

### Manual Steps Currently Required

1. **Initial Data Load** - Must call `/api/extraction/start` to begin extraction
2. **Relationship Discovery** - Must call `/api/relationships/bulk-infer` for comprehensive relationship analysis
3. **Status Monitoring** - Must check `/api/extraction/status` and `/api/ingestion/status`
4. **Error Recovery** - Must call `/api/extraction/reset` or `/api/extraction/reset-stale` on failures

---

## 5. Recommendations for Full Automation

### Priority 1: Real-Time Push Notifications

1. **Gmail Push Notifications**
   - Implement Gmail Pub/Sub subscription
   - Create `/api/webhooks/gmail` endpoint
   - Connect to `ingest-emails` function on push

2. **Calendar Watch**
   - Extend `/api/webhooks/google` to trigger extraction
   - Set up Calendar Watch for user calendars

3. **Drive Push Notifications**
   - Implement Drive Push Notifications
   - Create `/api/webhooks/drive` endpoint

### Priority 2: Continuous Agent Execution

1. Add cron triggers for `RelationshipDiscovererAgent`
   - Run after `ingest-emails` completes
   - Or schedule separately (e.g., every 6 hours)

2. Chain extraction events to relationship discovery
   - On `izzie/ingestion.entities.extracted`, emit agent trigger

### Priority 3: Operational Improvements

1. Implement OAuth token refresh in `ingest-emails.ts`
2. Add exponential backoff for rate limiting
3. Implement incremental calendar sync via syncToken
4. Add Contacts integration

---

## 6. Data Flow Diagram

```
                                    TRIGGERS
                                        |
    +-----------------------------------+-----------------------------------+
    |                   |                   |                   |
Cron (hourly)     Manual API         Webhook (future)      Agent Event
    |                   |                   |                   |
    v                   v                   v                   v
+-----------------------------------------------------------------------+
|                         INGESTION LAYER                                |
|  ingest-emails.ts | ingest-calendar.ts | ingest-drive.ts              |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                      EXTRACTION LAYER                                  |
|  EntityExtractor.extractFromEmail/extractFromCalendarEvent             |
|  - Mistral AI via OpenRouter                                          |
|  - Extracts: entities + inline relationships                          |
+-----------------------------------------------------------------------+
                                    |
                                    v
                    'izzie/ingestion.entities.extracted' event
                                    |
                                    v
+-----------------------------------------------------------------------+
|                        GRAPH UPDATE LAYER                              |
|  update-graph.ts (Inngest function)                                   |
|  1. Neo4j graph update (processExtraction)                            |
|  2. Weaviate relationship storage (saveRelationships)                 |
|  3. Memory service with embeddings                                    |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                  RELATIONSHIP INFERENCE (Phase 2)                      |
|  RelationshipDiscovererAgent OR /api/relationships/bulk-infer         |
|  - Groups entities by sourceId                                        |
|  - LLM-based inference (inference.ts)                                 |
|  - Saves additional relationships to Weaviate                         |
+-----------------------------------------------------------------------+
```

---

## 7. Summary

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| **Entity Extraction** | Semi-automatic (cron + manual) | Fully automatic (real-time push) |
| **Relationship Discovery** | Two-phase (inline + manual) | Continuous (chained to extraction) |
| **Sources** | Gmail, Calendar, Drive, Tasks | + Contacts |
| **Triggers** | Cron, Manual API | + Webhooks, Real-time push |
| **Monitoring** | Manual status checks | Automated alerting |

The system has a solid foundation for entity extraction and relationship discovery. The primary gap is the lack of real-time triggers - everything currently runs on schedules or requires manual initiation. Implementing Gmail Push Notifications and Calendar Watch would transform this into a fully automatic system.
