# Documentation Access for Izzie - Research Analysis

**Date:** 2026-01-31
**Status:** Research Complete
**Ticket Context:** None provided (ad-hoc research)

---

## Executive Summary

Izzie has an extensive documentation system (~100+ markdown files) primarily for developer/setup reference. There is **no current mechanism** for Izzie to access or reference her own documentation when answering user questions. This research analyzes the current state and recommends approaches for adding documentation access.

---

## 1. Documentation Structure

### Current Layout

```
docs/
├── architecture/
│   └── izzie-architecture.md        # Core architecture doc (1042 lines)
├── guides/                          # User-facing guides
│   ├── START-HERE.md
│   ├── CHATBOT_README.md
│   ├── CHAT-QUICKSTART.md
│   ├── EXTRACTION-QUICKSTART.md
│   ├── CONTACTS-QUICKSTART.md
│   └── TASKS_TESTING_GUIDE.md
├── implementation/                   # Technical implementation details
│   ├── CHAT_SESSION_IMPLEMENTATION.md
│   ├── MEMORY_SYSTEM_IMPLEMENTATION.md
│   ├── ENTITY_DASHBOARD_SUMMARY.md
│   └── ~50 more implementation docs
├── fixes/                           # Bug fix reports
│   └── ~20 fix documentation files
├── research/                        # Research outputs
│   └── This file and others
└── ~20 root-level docs (setup, API docs, etc.)
```

### Root-Level Documentation

| File | Content | User-Facing? |
|------|---------|--------------|
| `README.md` | Basic project overview, tech stack, getting started | Yes |
| `CHANGELOG.md` | Version history (minimal content currently) | Yes |
| `CLAUDE.md` | Claude Code context, project memory config | No (dev) |

### Key User-Facing Documents

1. **docs/guides/START-HERE.md** - Email extraction quickstart
2. **docs/guides/CHATBOT_README.md** - Chat feature documentation (385 lines)
3. **docs/guides/EXTRACTION-QUICKSTART.md** - Entity extraction guide
4. **docs/guides/CONTACTS-QUICKSTART.md** - Contacts sync guide
5. **docs/architecture/izzie-architecture.md** - Full system architecture

### Documentation Gaps for Users

- **No central user guide** consolidating all features
- **No feature list** explaining Chat, Entities, Relationships, Train
- **No FAQ** for common questions
- **README.md is outdated** (references POC stages, old model names)
- **No "What can Izzie do?"** document

---

## 2. Self-Awareness System Analysis

### Current Implementation

**File:** `src/lib/chat/self-awareness.ts`

The self-awareness system provides Izzie with identity and capability context:

```typescript
interface SelfAwarenessContext {
  identity: {
    name: string;           // "Izzie"
    version: string;        // From BUILD_INFO
    description: string;    // Build info
    underlyingModel: string; // "Claude Opus 4.5"
  };
  architecture: {
    contextWindow: string;  // "Sliding window with last 5 messages..."
    memorySystem: string;   // "Extracts memories..."
    entitySystem: string;   // "Extracts and tracks entities..."
    sessionManagement: string;
  };
  connectors: ConnectorStatus[]; // Gmail, Calendar, Drive, Weaviate
  capabilities: string[];        // Dynamic list from tools
}
```

### How Context is Injected

1. **`getSelfAwarenessContext(userId)`** - Fetches context
2. **`formatSelfAwarenessForPrompt(context)`** - Formats for system prompt
3. **Used in:** `src/app/api/chat/route.ts`, `src/lib/telegram/message-handler.ts`

### Current Capabilities List

Generated dynamically from `chatTools`:
- Memory and context capabilities (6 hardcoded)
- Tool-based capabilities (generated from `src/lib/chat/tools/index.ts`):
  - Research tools
  - Task management (7 tools)
  - Email management (11 tools)
  - GitHub tools (4 tools)
  - Contacts tools (3 tools)

### Limitations

1. **Static architecture descriptions** - Hardcoded strings, not linked to docs
2. **No documentation access** - Cannot reference feature docs
3. **Tool-centric** - Lists what tools exist, not what features mean
4. **No version-specific features** - Can't explain what's new in a version

---

## 3. Search/RAG Capabilities

### Current Weaviate Integration

**Collections in Weaviate:**
- `Entity_Person`, `Entity_Company`, `Entity_Project`, etc. - Extracted entities
- `Memory_*` collections - User memories
- `ResearchFindings` - Research agent outputs
- `ToolEmbeddings` - MCP tool discovery

**Search Functions:**
- `searchEntities(query, userId, options)` - Keyword/semantic search
- `searchMemories(query, userId, options)` - Memory retrieval
- `retrieveContext()` - Combined entity + memory retrieval for chat

### Document Indexing Status

**NOT INDEXED:**
- `docs/` folder content
- README files
- User guides
- Architecture documentation

**Opportunity:** Create a `Documentation` collection in Weaviate

### Alternative: mcp-vector-search

**Available via MCP** for local codebase search:
- `mcp__mcp-vector-search__search_code` - Code search
- `mcp__mcp-vector-search__search_context` - Context search

**Not suitable** for runtime doc access (MCP is development-time tooling)

---

## 4. Current Features Requiring Documentation

### Major Features (from dashboard routes)

| Feature | Route | Current Doc | Needs Doc? |
|---------|-------|-------------|------------|
| Chat | `/dashboard/chat` | CHATBOT_README.md | Update |
| Entities | `/dashboard/entities` | Partial | Yes |
| Relationships | `/dashboard/relationships` | Minimal | Yes |
| Train | `/dashboard/train` | None | Yes |
| Calendar | `/dashboard/calendar` | calendar-api.md | Update |
| Extraction | `/dashboard/extraction` | Multiple guides | Consolidate |
| Settings | `/dashboard/settings/*` | Minimal | Yes |

### Recent Feature Additions (from git log)

```
cb41b1e fix: update nav to Chat, Entities, Relationships, Train
4457ac5 feat: add Train Izzie page for ML active learning
4119cbc feat(ai): upgrade MODELS.GENERAL from Sonnet 4.5 to Opus 4.5
19830c0 feat: add version and build info display to app header
```

### Tool Capabilities

**Currently documented in self-awareness:**
- Research (start async research, check status)
- Tasks (create, complete, list, manage lists)
- Email (archive, delete, label, send, bulk, drafts, filters)
- GitHub (list/create/update issues, comments)
- Contacts (search, details, sync)

---

## 5. Recommended Approaches

### Option A: Index Docs to Weaviate (Recommended)

**Approach:** Add documentation as a searchable collection

**Implementation:**
1. Create `Documentation` collection schema in Weaviate
2. Write `docs/` indexing script that:
   - Parses markdown files
   - Chunks by heading/section
   - Generates embeddings
   - Stores with metadata (path, title, section)
3. Add `searchDocumentation()` function to retrieval
4. Update `retrieveContext()` to optionally include doc search
5. Add `help` or `docs` tool to chat tools

**Pros:**
- Semantic search over all docs
- Scales with doc growth
- Consistent with existing Weaviate patterns
- Can include relevance scoring

**Cons:**
- Requires indexing pipeline
- Needs re-indexing on doc changes
- Adds query latency

**Estimated Effort:** 2-3 days

### Option B: Load Docs at Runtime

**Approach:** Read relevant markdown files when needed

**Implementation:**
1. Create `docs/USER_GUIDE.md` consolidating key info
2. Add `loadDocumentation()` function
3. Inject into system prompt when questions match doc patterns
4. Use simple pattern matching for doc selection

**Pros:**
- Simple implementation
- Always up-to-date
- No indexing required

**Cons:**
- Limited scalability
- No semantic search
- Increases prompt size
- Manual curation required

**Estimated Effort:** 1 day

### Option C: Hybrid Approach (Best for Izzie)

**Approach:** Static core docs + semantic search for extended docs

**Implementation:**
1. **Phase 1: Static docs**
   - Create `docs/USER_GUIDE.md` with feature overview
   - Load in `getSelfAwarenessContext()` for identity questions
   - Small, curated, always included

2. **Phase 2: Indexed docs**
   - Index implementation docs to Weaviate
   - Add `search_documentation` tool
   - Use for "how do I..." questions

**Pros:**
- Immediate value from static docs
- Scalable with indexed docs
- Best of both worlds

**Cons:**
- Two systems to maintain
- Requires good doc organization

**Estimated Effort:** 1 day (Phase 1) + 2 days (Phase 2)

---

## 6. User Documentation Needs

### Immediate Priorities

1. **Create `docs/USER_GUIDE.md`** - Central feature documentation
   - What is Izzie?
   - Core features (Chat, Entities, Relationships, Train)
   - How to get started
   - Common questions

2. **Update `README.md`**
   - Current version info
   - Feature list
   - Updated tech stack (Opus 4.5, etc.)

3. **Update self-awareness capabilities**
   - More descriptive feature explanations
   - Link to relevant docs
   - Version-specific changes

### Document Topics Needed

| Topic | Priority | Exists? |
|-------|----------|---------|
| Feature overview | High | No |
| Chat capabilities | High | Partial |
| Entity extraction explained | High | Partial |
| Relationship discovery | High | No |
| Train/Active learning | High | No |
| Settings configuration | Medium | No |
| Troubleshooting FAQ | Medium | No |
| API reference | Low | Partial |

---

## 7. Implementation Recommendation

### Immediate (This Sprint)

1. **Create `docs/USER_GUIDE.md`** with:
   - Feature overview (500 words)
   - Chat section (how to use, examples)
   - Entities section (what they are, how to view)
   - Relationships section
   - Train section
   - Settings overview

2. **Update `self-awareness.ts`**:
   - Add `documentation` field to context
   - Include USER_GUIDE content summary
   - Better capability descriptions

3. **Add pattern detection** in chat:
   - Detect "help", "how do I", "what can you do"
   - Return documentation-aware responses

### Near-Term (Next Sprint)

1. **Index docs to Weaviate**
   - Create `Documentation` collection
   - Write indexing script
   - Add to retrieval pipeline

2. **Add `search_documentation` tool**
   - Allow explicit doc searches
   - Return formatted doc sections

### Metrics for Success

- Izzie can answer "What can you do?" with accurate feature list
- Izzie can explain each dashboard feature
- Izzie can point users to relevant documentation
- Reduced user confusion about capabilities

---

## 8. Files to Create/Modify

### New Files

```
docs/USER_GUIDE.md                    # Central user documentation
scripts/index-docs-to-weaviate.ts     # Doc indexing script (Phase 2)
src/lib/weaviate/documentation.ts     # Doc search functions (Phase 2)
```

### Modified Files

```
src/lib/chat/self-awareness.ts        # Add documentation context
src/lib/chat/context-retrieval.ts     # Add doc search option
src/lib/chat/tools/index.ts           # Add search_documentation tool
README.md                             # Update with current features
```

---

## Summary

| Aspect | Current State | Recommendation |
|--------|---------------|----------------|
| Docs structure | Extensive but dev-focused | Create USER_GUIDE.md |
| Self-awareness | Tool-centric, static | Add documentation context |
| Search/RAG | No doc indexing | Index to Weaviate (Phase 2) |
| User features | Undocumented | Document all dashboard features |

**Next Steps:**
1. Create USER_GUIDE.md (1 day)
2. Update self-awareness.ts (0.5 days)
3. Update README.md (0.5 days)
4. Plan Weaviate doc indexing sprint
