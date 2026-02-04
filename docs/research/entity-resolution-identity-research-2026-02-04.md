# Entity Resolution, Identity Management, and Knowledge Graphs for Personal AI Assistants

**Research Date:** February 4, 2026
**Project:** Izzie - Personal AI Assistant
**Author:** Research Agent

---

## Executive Summary

This research document investigates approaches to entity resolution, identity management, and knowledge graphs specifically for personal AI assistants. The goal is to inform Izzie's development with proven patterns from industry leaders, academic research, and open-source implementations.

**Key Findings:**
1. **Hybrid approaches win**: Combining string similarity, ML embeddings, and graph-based methods yields the best results
2. **Confidence thresholds are essential**: Auto-merge above 95%, suggest review 70-95%, manual below 70%
3. **User identity is privileged**: The "me" entity requires special handling distinct from other entities
4. **Human-in-the-loop is critical**: Users must be able to confirm, reject, and teach the system
5. **Graph databases excel**: Entity resolution benefits greatly from graph-based relationship modeling

---

## Table of Contents

1. [Entity Resolution / Record Linkage](#1-entity-resolution--record-linkage)
2. [Knowledge Graphs for Personal Data](#2-knowledge-graphs-for-personal-data)
3. [SAME_AS and Semantic Web Identity](#3-same_as-and-semantic-web-identity)
4. [Contact Deduplication in CRMs and Phone Apps](#4-contact-deduplication-in-crms-and-phone-apps)
5. [Human-in-the-Loop Entity Resolution UX](#5-human-in-the-loop-entity-resolution-ux)
6. [Personal AI Assistants Identity Handling](#6-personal-ai-assistants-identity-handling)
7. [Current Izzie Implementation Analysis](#7-current-izzie-implementation-analysis)
8. [Recommended Architecture for Izzie](#8-recommended-architecture-for-izzie)
9. [UI/UX Patterns to Adopt](#9-uiux-patterns-to-adopt)
10. [Data Model Recommendations](#10-data-model-recommendations)
11. [Implementation Priorities](#11-implementation-priorities)

---

## 1. Entity Resolution / Record Linkage

### 1.1 Classical Algorithms

#### String Similarity Metrics

| Algorithm | Best For | Complexity | Notes |
|-----------|----------|------------|-------|
| **Levenshtein Distance** | Typos, minor variations | O(mn) | Edit distance between strings |
| **Jaro-Winkler** | Names (prefix-weighted) | O(mn) | Gives higher scores to strings with matching prefixes |
| **Damerau-Levenshtein** | Transpositions | O(mn) | Adds transposition as single edit |
| **Cosine Similarity** | Multi-word comparisons | O(n) | Token-based, good for longer text |
| **Soundex/Metaphone** | Phonetic matching | O(n) | "Smith" = "Smyth" |

**Recommendation for Izzie:** Use Jaro-Winkler for person names (prefix weighting helps with "Bob" vs "Bobby"), Levenshtein for company names, and phonetic matching as a fallback.

#### Blocking Strategies

To avoid O(n^2) comparisons, use blocking:
- **Standard Blocking**: Group by first letter of last name
- **Sorted Neighborhood**: Sort by key, compare within sliding window
- **LSH (Locality Sensitive Hashing)**: Hash similar items to same buckets

### 1.2 Machine Learning Approaches

#### Transformer Embeddings (State of the Art)

**Ditto Framework** (Li et al., 2020):
- Achieves 90.18% F1 on benchmark datasets
- Uses pre-trained language models (BERT, RoBERTa)
- Handles dirty data, abbreviations, missing values
- Key insight: Serialize entity pairs as text, use [SEP] token

**SBERT (Sentence-BERT)**:
- Generates embeddings for entity mentions
- Cosine similarity between embeddings
- Fast at inference time (pre-compute embeddings)

**Recommendation for Izzie:** Generate embeddings for entities using a small model (all-MiniLM-L6-v2), cache embeddings, compare with cosine similarity.

### 1.3 Commercial Solutions

#### Senzing

**Architecture Highlights:**
- Principle-based entity resolution (not just rules)
- Real-time ML that learns from data patterns
- Sequence-neutral processing (order of records doesn't matter)
- Handles 400M records on $5K server
- Automatic feature extraction from data

**Key Concepts:**
- **Entity**: A resolved real-world thing
- **Record**: A single data record
- **Feature**: An extracted characteristic (name, address, etc.)
- **Principle**: Why two records should/shouldn't match

#### Tamr

- Cloud-native data mastering
- ML-powered with human-in-the-loop
- Enterprise-focused (Salesforce, SAP integration)

### 1.4 Open Source Libraries

#### dedupe.io (Python)

```python
# Example usage pattern
import dedupe

# Define fields
fields = [
    {'field': 'name', 'type': 'String'},
    {'field': 'email', 'type': 'String'},
    {'field': 'company', 'type': 'String'},
]

# Train with active learning
deduper = dedupe.Dedupe(fields)
deduper.prepare_training(data)

# Label examples interactively
dedupe.console_label(deduper)

# Train and cluster
deduper.train()
clustered_dupes = deduper.partition(data, threshold=0.5)
```

**Key Features:**
- ML-based fuzzy matching
- Active learning (asks user to label uncertain pairs)
- Based on Bilenko's PhD dissertation
- Handles missing data gracefully

#### Splink (Python/SQL)

```python
from splink import Linker, SettingsCreator, block_on
import splink.comparison_library as cl

settings = SettingsCreator(
    link_type="dedupe_only",
    comparisons=[
        cl.JaroWinklerAtThresholds("first_name"),
        cl.LevenshteinAtThresholds("surname"),
        cl.ExactMatch("email"),
    ],
    blocking_rules_to_generate_predictions=[
        block_on("first_name"),
        block_on("surname"),
    ],
)

linker = Linker(df, settings, db_api=DuckDBAPI())
linker.training.estimate_probability_two_random_records_match(
    deterministic_rules, recall=0.7
)
```

**Key Features:**
- Fellegi-Sunter probabilistic model
- DuckDB/Spark backends (handles 100M+ records)
- UK Ministry of Justice developed
- 1M records in <2 minutes

---

## 2. Knowledge Graphs for Personal Data

### 2.1 Personal Knowledge Management (PKM) Systems

#### Roam Research

**Graph Model:**
- Every page is a node
- Bi-directional links create edges
- Block references enable granular linking
- Daily notes as temporal anchors

**Entity Handling:**
- `[[Person Name]]` creates entity node
- Automatic backlink discovery
- No explicit entity types (emergent structure)

#### Obsidian

**Graph Model:**
- Markdown files as nodes
- `[[wiki-links]]` as edges
- Tags as additional categorization
- Local-first (no cloud dependency)

**Entity Handling:**
- Properties/frontmatter for metadata
- Dataview plugin for querying
- Graph view for relationship visualization

#### Notion

**Database Model:**
- Relational databases with properties
- Relations link between databases
- Rollups aggregate related data

**Entity Handling:**
- People database with properties
- Relations to Projects, Companies, etc.
- Templates for consistent entity creation

### 2.2 Enterprise Knowledge Graphs

#### Google Knowledge Graph

**Key Concepts:**
- **Knowledge Panel**: UI representation of entity
- **Disambiguation**: "Apple" (company) vs "apple" (fruit)
- **Entity Reconciliation**: Merging entities across sources
- **Freebase Legacy**: Acquired 2010, integrated into KG

**Techniques:**
- Entity linking with context
- Coreference resolution
- Cross-lingual entity matching

#### Wikidata

**Model:**
- **QID**: Unique identifier (Q42 = Douglas Adams)
- **Properties**: P31 (instance of), P569 (date of birth)
- **Statements**: Entity + Property + Value + Qualifiers
- **Aliases**: Multiple names for same entity

**Lessons for Izzie:**
- Unique identifiers essential for disambiguation
- Aliases/alternate names are first-class citizens
- Hierarchical types (person > author > science fiction writer)

### 2.3 Graph Databases for Entity Resolution

**Why Graphs Excel:**
- Entities are nodes, relationships are edges
- Transitive closure: A=B and B=C implies A=C
- Path queries: "How is person X connected to company Y?"
- Relationship strength/weight modeling

**Neo4j Patterns:**
```cypher
// Create SAME_AS relationship
MATCH (a:Person {name: "Bob Matsuoka"})
MATCH (b:Person {name: "Robert Matsuoka"})
MERGE (a)-[:SAME_AS {confidence: 0.95, source: "email_matching"}]->(b)

// Query resolved entity
MATCH (p:Person)-[:SAME_AS*0..3]-(other:Person)
WHERE p.name = "Bob"
RETURN DISTINCT other.name
```

---

## 3. SAME_AS and Semantic Web Identity

### 3.1 owl:sameAs Semantics

**Formal Definition:**
- States that two URIs refer to the same real-world entity
- Transitive, symmetric, reflexive
- All properties of one are true of the other

**The sameAs Problem:**
- In practice, sameAs is often used loosely
- "Similar to" or "related to" conflated with "identical"
- Can cause inference explosion in large graphs

**Alternative Properties:**
- `skos:closeMatch`: Similar but not identical
- `skos:exactMatch`: Equivalent for mapping purposes
- `rdfs:seeAlso`: Related resource
- Custom `izzie:likelyMatch`: Probabilistic matching

### 3.2 Wikipedia/Wikidata Disambiguation

**Disambiguation Pages:**
- List multiple entities with same name
- Each links to specific entity page
- Structured with categories

**Wikidata Approach:**
- QID as stable identifier
- Labels in multiple languages
- Descriptions for disambiguation
- Aliases capture variations

**Example:**
```
Q76 (Barack Obama)
  Labels: "Barack Obama" (en), "Obama" (common)
  Aliases: "Barry Obama", "Barack Hussein Obama II"
  Description: "44th President of the United States"
```

### 3.3 DBpedia and Freebase

**DBpedia:**
- Extracts structured data from Wikipedia
- URIs based on Wikipedia titles
- Interlinks with external datasets
- 4.58 million entities

**Freebase (Deprecated):**
- Google acquired 2010
- 1.9 billion facts about 40 million entities
- MID (Machine ID) as unique identifier
- Migrated to Wikidata

**Lessons:**
- Stable identifiers are crucial
- Aliases and redirects handle variations
- Types/categories aid disambiguation

---

## 4. Contact Deduplication in CRMs and Phone Apps

### 4.1 CRM Solutions

#### Salesforce

**Matching Rules:**
- Fuzzy matching on name fields
- Exact match on email (primary key)
- Configurable matching criteria
- Threshold-based auto-merge

**Duplicate Management:**
- Duplicate Record Sets (groups)
- Merge wizard for manual resolution
- Duplicate Jobs for batch processing
- Report on potential duplicates

#### HubSpot

**Deduplication Approach:**
- Email as unique identifier (primary)
- ML-based duplicate detection
- Confidence scores shown to users
- Manual merge with conflict resolution

**Best Practices:**
- Import deduplication before adding
- Regular duplicate scans
- Merge vs. associate decisions

### 4.2 Phone Contact Apps

#### Apple iOS Contacts

**Duplicate Detection:**
- First + Last name matching
- Fuzzy matching on name variations
- Requires iCloud for cross-device

**Merge Interface:**
- "Link Contacts" feature
- Side-by-side comparison
- Field-level merge selection
- Undo capability

**Limitations:**
- No automatic merging
- Limited fuzzy matching
- No ML-based suggestions

#### Google Contacts

**Duplicate Detection:**
- ML-based duplicate suggestions
- "Merge & fix" recommendations
- Batch duplicate finding

**Merge Interface:**
- "Find and merge duplicates"
- Preview before merge
- Keep all data from both records

### 4.3 Specialized Contact Apps

#### Cloze

- Relationship intelligence platform
- Automatic contact enrichment
- Activity timeline per contact
- AI-powered relationship scoring

#### FullContact

- Identity resolution as a service
- API for contact enrichment
- Multi-source matching
- Enterprise-grade deduplication

---

## 5. Human-in-the-Loop Entity Resolution UX

### 5.1 Confidence Threshold Patterns

**Three-Tier System:**
```
Score >= 95%  → Auto-merge (high confidence)
70% - 95%    → Suggest for review (uncertain)
Score < 70%  → No action (likely different)
```

**Visual Indicators:**
- Green: High confidence, auto-merged
- Yellow/Orange: Medium confidence, needs review
- Red: Low confidence, flagged as potential error

### 5.2 UI Patterns

#### Side-by-Side Comparison

```
+------------------+     +------------------+
| Bob Matsuoka     |  ?  | Robert Matsuoka  |
| bob@company.com  |     | bob@gmail.com    |
| VP Engineering   |     | (no title)       |
+------------------+     +------------------+
         [ Merge ]  [ Keep Separate ]
```

#### Drag-and-Drop Clustering (SystemER)

- Entities as cards
- Drag to cluster together
- Visual feedback on clusters
- Undo/redo support

#### Stratified Sampling for Labeling

- Show diverse examples
- Balance easy and hard cases
- Error-driven selection (prioritize mistakes)
- Progressive refinement

### 5.3 Feedback Mechanisms

**Explicit Feedback:**
- "These are the same person" button
- "These are different people" button
- "Not sure" option

**Implicit Feedback:**
- User edits merged record → confirm merge
- User un-merges → incorrect merge
- User ignores suggestion → uncertain

**Learning from Feedback:**
- Update model weights
- Add to training set
- Improve future suggestions

### 5.4 Merge Conflict Resolution

**Field-Level Conflicts:**
```
Name:    [x] "Bob Matsuoka"  [ ] "Robert Matsuoka"
Email:   [x] Keep both: bob@company.com, bob@gmail.com
Title:   [x] "VP Engineering" (more recent)
```

**Policies:**
- Most recent wins
- Most complete wins
- User chooses per field
- Keep all values (multi-valued)

---

## 6. Personal AI Assistants Identity Handling

### 6.1 Rewind.ai

**Approach:**
- Records screen, microphone continuously
- Local-first processing
- Search across all captured data
- Entity extraction from recordings

**Identity Handling:**
- OCR for names on screen
- Speech-to-text for mentioned names
- No explicit entity resolution (search-based)

### 6.2 Mem.ai / Mem0

**Knowledge Graph Approach:**
- Automatic entity extraction
- LLM-based extraction pipeline
- Memory graph with relationships
- Context retrieval for conversations

**Entity Types:**
- People
- Organizations
- Projects
- Concepts
- Locations

### 6.3 Clay (Personal CRM)

**Key Features:**
- Relationship management focus
- AI helper "Nexus" for insights
- Automatic contact enrichment
- Activity tracking per contact

**Acquisition:**
- Acquired by Automattic (WordPress parent)
- Integrated as identity layer
- Cross-product entity resolution

### 6.4 Monica (Open Source)

**Personal CRM Features:**
- Contact management
- Relationship tracking
- Activity logging
- Reminders and notes

**Entity Model:**
- Contacts with relationships
- Activities linked to contacts
- Tags for categorization
- Custom fields

### 6.5 Common Patterns

**Privileged "Me" Entity:**
- Current user is always special
- Self-references consolidated
- First-person context awareness

**Contact Enrichment:**
- Pull from social profiles
- Email signature parsing
- Calendar event extraction
- Meeting notes mining

**Relationship Inference:**
- Co-occurrence in communications
- Mentioned together
- Shared context (projects, companies)

---

## 7. Current Izzie Implementation Analysis

### 7.1 Existing Components

#### EntityExtractor (`entity-extractor.ts`)

**Strengths:**
- Uses Mistral AI for extraction via OpenRouter
- Batch processing with chunking
- Frequency analysis (occurrence counting)
- Co-occurrence tracking
- Post-processing filters

**Current Deduplication:**
```typescript
const key = `${entity.type}:${entity.normalized}`;
```
Simple key-based deduplication using `type:normalized_value`.

**Limitations:**
- No ML-based matching
- No confidence scores for matches
- No graph-based relationship modeling
- No human-in-the-loop feedback

#### UserIdentity (`user-identity.ts`)

**Strengths:**
- OAuth-based user identity
- Nickname mapping (robert -> bob, bobby, rob)
- Multiple normalization strategies
- Email alias consolidation
- "Me" detection and marking

**Key Functions:**
```typescript
generateNameAliases(fullName: string): string[]
// "Bob Matsuoka" -> ["bob", "bob_matsuoka", "matsuoka", "robert_matsuoka"]

isCurrentUser(entity: Entity, identity: UserIdentity): boolean
// Checks against aliases, emails, name variants

normalizeToCurrentUser(entities: Entity[], identity: UserIdentity): Entity[]
// Consolidates self-references
```

#### Database Schema

**Existing Tables:**
- `userIdentity`: One identity per user with displayName
- `identityEntities`: Links entities to user identity (email, phone, name, company, title)
- `entityAliases`: Stores nicknames/aliases for entities

**Current Deduplication Logic:**
```typescript
// Priority: higher confidence > longer value > more recent
const shouldReplace =
  entity.confidence > existing.confidence ||
  (entity.confidence === existing.confidence &&
    entity.value.length > existing.value.length) ||
  (entity.confidence === existing.confidence &&
    entity.value.length === existing.value.length &&
    new Date(entity.createdAt).getTime() > new Date(existing.createdAt).getTime());
```

### 7.2 Gaps Identified

| Gap | Current State | Recommended State |
|-----|---------------|-------------------|
| ML Matching | None | SBERT embeddings + similarity |
| Confidence Scores | LLM confidence only | Match confidence for pairs |
| Graph Relationships | None | Entity-to-entity edges |
| Human Feedback | None | Merge suggestions UI |
| Alias Learning | Static nickname map | User-trainable aliases |
| Cross-Entity Links | Co-occurrence only | Explicit relationships |

---

## 8. Recommended Architecture for Izzie

### 8.1 Enhanced Entity Resolution Pipeline

```
+------------------+     +------------------+     +------------------+
| 1. Extraction    | --> | 2. Normalization | --> | 3. Blocking      |
| (Mistral AI)     |     | (Current system) |     | (First letter)   |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
+------------------+     +------------------+     +------------------+
| 6. User Review   | <-- | 5. Scoring       | <-- | 4. Comparison    |
| (if 70-95%)      |     | (Confidence)     |     | (Jaro-Winkler+   |
+------------------+     +------------------+     |  Embeddings)     |
         |                        |               +------------------+
         v                        v
+------------------+     +------------------+
| 7. Merge/Reject  | --> | 8. Graph Update  |
| (Feedback)       |     | (Relationships)  |
+------------------+     +------------------+
```

### 8.2 Matching Strategy

**Stage 1: Exact Match**
```typescript
// Fast path for identical normalized values
const exactKey = `${type}:${normalized.toLowerCase()}`;
if (entityMap.has(exactKey)) {
  return { match: true, confidence: 1.0, method: 'exact' };
}
```

**Stage 2: Alias Match**
```typescript
// Check against known aliases (nickname map + user-defined)
for (const alias of getAliases(type, normalized)) {
  const aliasKey = `${type}:${alias}`;
  if (entityMap.has(aliasKey)) {
    return { match: true, confidence: 0.95, method: 'alias' };
  }
}
```

**Stage 3: Fuzzy Match**
```typescript
// Jaro-Winkler for name similarity
const candidates = getBlockCandidates(type, normalized);
for (const candidate of candidates) {
  const score = jaroWinkler(normalized, candidate.normalized);
  if (score > 0.85) {
    return { match: true, confidence: score, method: 'fuzzy' };
  }
}
```

**Stage 4: Embedding Match**
```typescript
// Semantic similarity for edge cases
const embedding = await getEmbedding(value);
const similar = await findSimilarEmbeddings(embedding, type, threshold: 0.8);
if (similar.length > 0) {
  return { match: true, confidence: similar[0].similarity, method: 'embedding' };
}
```

### 8.3 Confidence Scoring

**Composite Score Formula:**
```
finalScore = w1 * stringScore + w2 * aliasScore + w3 * embeddingScore + w4 * contextScore

Where:
- stringScore: Jaro-Winkler or Levenshtein (0-1)
- aliasScore: 1.0 if known alias, 0.0 otherwise
- embeddingScore: Cosine similarity of embeddings (0-1)
- contextScore: Co-occurrence frequency, shared relationships (0-1)

Default weights: w1=0.3, w2=0.3, w3=0.2, w4=0.2
```

### 8.4 Graph-Based Resolution

**Entity Nodes:**
```typescript
interface EntityNode {
  id: string;
  type: 'person' | 'company' | 'project' | 'location';
  canonicalName: string;
  aliases: string[];
  embedding?: number[];
  metadata: Record<string, any>;
}
```

**Relationship Edges:**
```typescript
interface EntityEdge {
  sourceId: string;
  targetId: string;
  type: 'SAME_AS' | 'WORKS_AT' | 'KNOWS' | 'MENTIONED_WITH';
  confidence: number;
  source: 'auto' | 'user' | 'imported';
  createdAt: Date;
}
```

**Transitive Resolution:**
```sql
-- Find all entities that are SAME_AS the given entity
WITH RECURSIVE same_as_chain AS (
  SELECT target_id, 1 as depth
  FROM entity_edges
  WHERE source_id = :entityId AND type = 'SAME_AS'

  UNION ALL

  SELECT e.target_id, s.depth + 1
  FROM entity_edges e
  JOIN same_as_chain s ON e.source_id = s.target_id
  WHERE e.type = 'SAME_AS' AND s.depth < 3
)
SELECT DISTINCT target_id FROM same_as_chain;
```

---

## 9. UI/UX Patterns to Adopt

### 9.1 Merge Suggestion Interface

**Card-Based Design:**
```
+------------------------------------------+
| Potential Duplicate Found                 |
+------------------------------------------+
| +---------------+   +---------------+     |
| | Bob Matsuoka  |   | Robert M.     |     |
| | bob@acme.com  |   | rob@gmail.com |     |
| | VP Eng @ Acme |   | (no company)  |     |
| | 5 emails      |   | 2 emails      |     |
| +---------------+   +---------------+     |
|                                          |
| Confidence: 87%  Method: Name similarity |
|                                          |
| [  Same Person  ]  [  Different  ]       |
| [  Not Sure  ]                           |
+------------------------------------------+
```

### 9.2 Batch Review Interface

**Table View with Actions:**
```
+--------+----------------+----------------+--------+--------+
| Status | Entity 1       | Entity 2       | Score  | Action |
+--------+----------------+----------------+--------+--------+
| Review | Bob Matsuoka   | Robert M.      | 87%    | [Merge]|
| Auto   | Acme Corp      | ACME Corp      | 98%    | Merged |
| Review | John Smith     | Jon Smith      | 82%    | [...]  |
+--------+----------------+----------------+--------+--------+
         [ Merge Selected ]  [ Skip All ]  [ Train Model ]
```

### 9.3 Entity Profile with Aliases

**Unified View:**
```
+------------------------------------------+
| Bob Matsuoka                    [Edit]   |
+------------------------------------------+
| Also known as:                           |
|   - Robert Matsuoka                      |
|   - Robert M.                            |
|   - bob@acme.com                         |
|   + Add alias                            |
|                                          |
| Relationships:                           |
|   - Works at: Acme Corporation           |
|   - Knows: Jane Doe (15 co-occurrences)  |
|   - Project: Project Alpha               |
|                                          |
| Recent Mentions: 23 times this month     |
+------------------------------------------+
```

### 9.4 Conflict Resolution Modal

**Field-by-Field Selection:**
```
+------------------------------------------+
| Merge Contacts                           |
+------------------------------------------+
| Name:                                    |
|   (o) Bob Matsuoka    ( ) Robert M.      |
|                                          |
| Emails:                                  |
|   [x] bob@acme.com                       |
|   [x] rob@gmail.com                      |
|                                          |
| Company:                                 |
|   (o) Acme Corporation  ( ) (none)       |
|                                          |
| Title:                                   |
|   (o) VP Engineering  ( ) (none)         |
+------------------------------------------+
|        [ Cancel ]     [ Merge ]          |
+------------------------------------------+
```

### 9.5 Training Mode

**Active Learning Interface:**
```
+------------------------------------------+
| Help Izzie Learn (3/10)                  |
+------------------------------------------+
| Are these the same person?               |
|                                          |
| "Bob" from "Meeting with Bob tomorrow"   |
|                                vs        |
| "Bob Matsuoka" from email signature      |
|                                          |
|   [  Yes, Same  ]   [  No, Different  ]  |
|   [  Skip  ]        [  I'm Not Sure  ]   |
|                                          |
| Progress: [======>        ] 30%          |
+------------------------------------------+
```

---

## 10. Data Model Recommendations

### 10.1 Enhanced Entity Schema

```sql
-- Core entities table with embedding support
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- 'person', 'company', 'project', 'location'
  canonical_value TEXT NOT NULL, -- Best known name
  normalized TEXT NOT NULL, -- For indexing
  confidence REAL DEFAULT 0.5, -- Extraction confidence
  embedding VECTOR(384), -- SBERT embedding
  occurrence_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Aliases (many-to-one with entities)
CREATE TABLE entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source TEXT NOT NULL, -- 'extracted', 'user_defined', 'nickname_map'
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(entity_id, normalized)
);

-- Relationships between entities
CREATE TABLE entity_relationships (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- 'SAME_AS', 'WORKS_AT', 'KNOWS', 'MENTIONED_WITH'
  confidence REAL NOT NULL,
  source TEXT NOT NULL, -- 'auto', 'user', 'imported'
  evidence JSONB, -- Supporting data
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_entity_id, target_entity_id, relationship_type)
);

-- Merge suggestions for human review
CREATE TABLE merge_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_a_id TEXT NOT NULL REFERENCES entities(id),
  entity_b_id TEXT NOT NULL REFERENCES entities(id),
  confidence REAL NOT NULL,
  method TEXT NOT NULL, -- 'exact', 'alias', 'fuzzy', 'embedding'
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'skipped'
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User feedback for training
CREATE TABLE entity_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_a_id TEXT NOT NULL REFERENCES entities(id),
  entity_b_id TEXT NOT NULL REFERENCES entities(id),
  feedback TEXT NOT NULL, -- 'same', 'different', 'uncertain'
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 10.2 Indexes for Performance

```sql
-- Fast lookup by normalized value
CREATE INDEX idx_entities_user_type_normalized
  ON entities(user_id, type, normalized);

-- Alias lookup
CREATE INDEX idx_aliases_normalized
  ON entity_aliases(normalized);

-- Relationship traversal
CREATE INDEX idx_relationships_source
  ON entity_relationships(source_entity_id);
CREATE INDEX idx_relationships_target
  ON entity_relationships(target_entity_id);

-- Pending merge suggestions
CREATE INDEX idx_suggestions_pending
  ON merge_suggestions(user_id, status)
  WHERE status = 'pending';

-- Vector similarity search (if using pgvector)
CREATE INDEX idx_entities_embedding
  ON entities USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### 10.3 Migration Strategy

**Phase 1: Add New Tables (Non-Breaking)**
```sql
-- Add entity_relationships table
-- Add merge_suggestions table
-- Add entity_feedback table
-- Add embedding column to entities (nullable)
```

**Phase 2: Migrate Existing Data**
```sql
-- Generate aliases from existing entity_aliases table
-- Create SAME_AS relationships from duplicate entities
-- Compute embeddings for existing entities (batch job)
```

**Phase 3: Enable New Features**
```sql
-- Enable merge suggestion generation
-- Enable embedding-based matching
-- Enable feedback loop
```

---

## 11. Implementation Priorities

### Phase 1: Foundation (1-2 weeks)

**Priority: HIGH**

1. **Add Confidence Scoring to Extraction**
   - Modify `EntityExtractor` to include match confidence
   - Add confidence to deduplication logic
   - Store confidence in database

2. **Enhance Alias System**
   - Extend nickname map with user-defined aliases
   - Add alias learning from merges
   - Implement alias lookup in matching

3. **Add Merge Suggestions Table**
   - Create database schema
   - Generate suggestions during extraction
   - Basic API endpoints for suggestions

### Phase 2: Smart Matching (2-3 weeks)

**Priority: MEDIUM-HIGH**

4. **Implement Jaro-Winkler Matching**
   - Add `string-similarity` or custom implementation
   - Integrate into matching pipeline
   - Configure thresholds by entity type

5. **Add Embedding Support**
   - Choose embedding model (all-MiniLM-L6-v2)
   - Generate embeddings for new entities
   - Batch generate for existing entities
   - Implement similarity search

6. **Graph Relationships**
   - Add entity_relationships table
   - Generate SAME_AS from merges
   - Generate MENTIONED_WITH from co-occurrences

### Phase 3: Human-in-the-Loop (2-3 weeks)

**Priority: MEDIUM**

7. **Merge Suggestion UI**
   - Card-based comparison view
   - Accept/Reject/Skip actions
   - Batch review interface

8. **Entity Profile Page**
   - Unified view with aliases
   - Relationship visualization
   - Merge history

9. **Feedback Loop**
   - Store user decisions
   - Use feedback to improve matching
   - Active learning for edge cases

### Phase 4: Advanced Features (3-4 weeks)

**Priority: LOW-MEDIUM**

10. **Cross-Entity Relationships**
    - WORKS_AT (person -> company)
    - KNOWS (person -> person)
    - INVOLVED_IN (person -> project)

11. **Automatic Enrichment**
    - Email signature parsing
    - Calendar event extraction
    - Social profile linking

12. **Graph Visualization**
    - Interactive entity graph
    - Relationship exploration
    - Cluster visualization

### Quick Wins (Can Start Immediately)

1. **Improve Nickname Map**: Expand `getCommonNicknames()` with more variations
2. **Case-Insensitive Matching**: Ensure all comparisons are lowercase
3. **Whitespace Normalization**: Handle "Bob  Matsuoka" vs "Bob Matsuoka"
4. **Email Extraction from Names**: "Bob Matsuoka <bob@acme.com>" parsing

---

## Appendix A: Algorithm Reference

### Jaro-Winkler Implementation

```typescript
function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroDistance(s1, s2);

  // Find common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  // Winkler modification: boost for common prefix
  return jaro + (prefix * 0.1 * (1 - jaro));
}

function jaroDistance(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
     matches / s2.length +
     (matches - transpositions / 2) / matches) / 3
  );
}
```

### Blocking Function

```typescript
function getBlockKey(type: string, value: string): string {
  const normalized = value.toLowerCase().trim();

  switch (type) {
    case 'person':
      // Block by first letter of first word
      const firstWord = normalized.split(/\s+/)[0];
      return `person:${firstWord[0] || 'unknown'}`;

    case 'company':
      // Block by first 3 characters (handles "The X Corp")
      const cleaned = normalized.replace(/^the\s+/i, '');
      return `company:${cleaned.slice(0, 3)}`;

    default:
      return `${type}:${normalized[0] || 'unknown'}`;
  }
}
```

---

## Appendix B: External Resources

### Academic Papers

1. Bilenko, M. (2006). "Learnable Similarity Functions and their Applications to Clustering and Record Linkage." PhD Thesis, UT Austin.

2. Li, Y., et al. (2020). "Deep Entity Matching with Pre-Trained Language Models." VLDB.

3. Fellegi, I. & Sunter, A. (1969). "A Theory for Record Linkage." JASA.

### Open Source Projects

- **dedupe.io**: https://github.com/dedupeio/dedupe
- **Splink**: https://github.com/moj-analytical-services/splink
- **Record Linkage Toolkit**: https://github.com/J535D165/recordlinkage
- **py_stringmatching**: https://github.com/anhaidgroup/py_stringmatching

### Commercial Solutions

- **Senzing**: https://senzing.com
- **Tamr**: https://tamr.com
- **Reltio**: https://reltio.com

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Entity Resolution** | Process of identifying records that refer to the same real-world entity |
| **Record Linkage** | Connecting records from different sources that refer to same entity |
| **Deduplication** | Finding and merging duplicate records within a single dataset |
| **Blocking** | Grouping records to reduce comparison space |
| **Canonical Form** | The standardized, authoritative representation of an entity |
| **Alias** | Alternative name or identifier for an entity |
| **SAME_AS** | Relationship indicating two identifiers refer to same entity |
| **Confidence Score** | Probability that two records refer to same entity (0-1) |
| **Human-in-the-Loop** | System design where humans review uncertain decisions |
| **Active Learning** | ML technique where model queries user for labels on uncertain examples |
| **Transitive Closure** | If A=B and B=C, then A=C |
| **Embedding** | Dense vector representation of text for similarity comparison |

---

*Research compiled from web searches, industry analysis, and codebase investigation.*
*Last updated: February 4, 2026*
