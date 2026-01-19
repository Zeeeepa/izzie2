# Research Agent

Deep research agent with web search, content analysis, and intelligent synthesis.

## Overview

The Research Agent is a comprehensive AI-powered research system that:
1. **Plans** research by decomposing queries into focused sub-queries
2. **Searches** the web for relevant information
3. **Fetches** and caches content from sources
4. **Analyzes** sources for relevance, credibility, and key findings
5. **Synthesizes** findings into coherent summaries with citations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Research Agent                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Planner         → Decompose query into sub-tasks       │
│  2. Search          → Execute web searches                  │
│  3. Fetcher         → Fetch and cache content               │
│  4. Analyzer        → Score and extract findings            │
│  5. Synthesizer     → Combine into summary                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Query Planner (`planner.ts`)
Decomposes complex research queries into 2-5 focused sub-queries.

**Example**:
```typescript
import { planResearch } from '@/agents/research';

const plan = await planResearch(
  'What are the best practices for Next.js 14 server components?',
  'Building a production app with server components'
);

// Result:
// {
//   mainQuery: "What are the best practices...",
//   subTasks: [
//     { query: "Next.js 14 server components data fetching", purpose: "..." },
//     { query: "Next.js server components performance optimization", purpose: "..." }
//   ],
//   estimatedCost: 0.03,
//   estimatedTime: 20000
// }
```

### 2. Content Analyzer (`analyzer.ts`)
Analyzes fetched content for:
- **Relevance** (0-1): How relevant to the query
- **Credibility** (0-1): Source quality and trustworthiness
- **Findings**: Key claims and evidence
- **Key Points**: Main takeaways

**Example**:
```typescript
import { analyzeSource } from '@/agents/research';

const analysis = await analyzeSource(
  content,
  'Next.js server components',
  'https://nextjs.org/docs',
  'Next.js Documentation'
);

// Result:
// {
//   url: "https://nextjs.org/docs",
//   relevance: 0.95,
//   credibility: 0.9,
//   findings: [
//     {
//       claim: "Server components reduce bundle size",
//       evidence: "Components run on server, not sent to client",
//       confidence: 0.9,
//       sourceUrl: "https://nextjs.org/docs"
//     }
//   ],
//   keyPoints: ["Server components improve performance", "..."]
// }
```

### 3. Result Synthesizer (`synthesizer.ts`)
Combines findings into coherent summary with:
- Markdown-formatted summary
- Top findings ranked by confidence
- Citations and references
- Quality metrics

**Example**:
```typescript
import { synthesize, calculateQualityScore } from '@/agents/research';

const synthesis = await synthesize(findings, sources, originalQuery);

// Quality score breakdown
const quality = calculateQualityScore(findings, sources);
// {
//   score: 0.85,
//   breakdown: {
//     findingsScore: 0.9,
//     sourcesScore: 0.8,
//     credibilityScore: 0.85
//   }
// }
```

## Usage

### Via ResearchAgent Class

```typescript
import { ResearchAgent } from '@/agents/research';
import { TaskManager } from '@/agents/base';

const taskManager = new TaskManager();
const agent = new ResearchAgent();

// Create task
const task = await taskManager.createTask(
  'research',
  userId,
  {
    query: 'What are the best practices for Next.js 14 server components?',
    maxSources: 10,
    excludeDomains: ['example.com']
  },
  {
    budgetLimit: 0.50, // $0.50 max
    totalSteps: 5
  }
);

// Build context
const context = {
  task,
  userId,
  updateProgress: async (progress) => {
    await taskManager.updateTask(task.id, progress);
  },
  addCost: async (tokens, cost) => {
    // Track cost
  },
  checkBudget: async () => true,
  isCancelled: async () => false,
};

// Execute
const result = await agent.run(
  {
    query: 'What are the best practices for Next.js 14 server components?',
    maxSources: 10
  },
  context
);

if (result.success) {
  console.log(result.data.summary);
  console.log(`Found ${result.data.findings.length} findings`);
  console.log(`Cost: $${result.totalCost.toFixed(4)}`);
}
```

### Via Inngest Event

```typescript
import { inngest } from '@/lib/events';

// Send research request
await inngest.send({
  name: 'izzie/research.request',
  data: {
    taskId: task.id,
    userId: 'user-123',
    query: 'What are the best practices for Next.js 14 server components?',
    maxSources: 10,
    excludeDomains: ['spam.com']
  }
});

// Listen for completion
inngest.on('izzie/research.completed', async (event) => {
  const { taskId, success, totalCost } = event.data;
  console.log(`Research ${taskId} completed: ${success}`);
});
```

## Configuration

### Budget Limits

The agent supports budget limits to prevent runaway costs:

```typescript
const agent = new ResearchAgent();
// Default: $0.50 max, 5 minutes max duration

// Override in constructor (not currently exposed, but available)
// maxBudget: 1.00,  // $1.00 max
// maxDuration: 600000,  // 10 minutes
```

### Search Options

```typescript
const input: ResearchInput = {
  query: 'Your research query',
  context: 'Additional context about what you want',  // optional
  maxSources: 15,  // default 10
  maxDepth: 1,     // default 1 (not fully implemented yet)
  focusAreas: ['performance', 'security'],  // optional
  excludeDomains: ['spam.com', 'ads.com'],  // optional
};
```

## Cost Structure

The Research Agent uses tiered AI models to optimize costs:

- **Query Planning**: CHEAP tier (Mistral Small) - ~$0.001 per query
- **Content Analysis**: CHEAP tier - ~$0.01 per source
- **Synthesis**: STANDARD tier (Claude Sonnet) - ~$0.02 per synthesis

**Typical costs**:
- Simple query (5 sources): ~$0.06
- Medium query (10 sources): ~$0.12
- Complex query (15 sources): ~$0.20

## Performance

**Typical execution times**:
- Planning: 1-2 seconds
- Search (5 queries): 2-3 seconds
- Fetch (10 sources): 10-15 seconds (parallel)
- Analysis (10 sources): 15-20 seconds (parallel batches)
- Synthesis: 3-5 seconds

**Total**: ~30-45 seconds for 10 sources

## Error Handling

The agent gracefully handles failures:

- **Partial results**: If some sources fail to fetch, continues with successful ones
- **Budget exceeded**: Returns partial results if budget limit hit
- **Cancellation**: Supports task cancellation via context.isCancelled()
- **Retries**: Automatic retry for transient failures (2 retries with backoff)

## Testing

```bash
# Run tests
npm test src/agents/research

# Test individual components
npm test src/agents/research/planner.test.ts
npm test src/agents/research/analyzer.test.ts
```

## Future Enhancements

- [ ] Multi-depth research (follow links from initial sources)
- [ ] Source deduplication (detect similar sources)
- [ ] Citation graph (track which sources cite each other)
- [ ] Incremental results (stream findings as they're discovered)
- [ ] Research cache (reuse recent research on similar queries)
- [ ] Research templates (pre-configured for specific domains)

## Related

- **Base Agent**: `/src/agents/base/` - Foundation framework
- **Web Search**: `/src/lib/search/` - Search and fetch infrastructure
- **AI Client**: `/src/lib/ai/` - OpenRouter AI integration
- **Events**: `/src/lib/events/` - Inngest orchestration
