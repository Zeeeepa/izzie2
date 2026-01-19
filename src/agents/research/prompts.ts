/**
 * Research Agent AI Prompts
 * AI prompts for query planning, analysis, and synthesis
 */

/**
 * Query Planner Prompt
 * Decomposes complex queries into focused sub-queries
 */
export function buildQueryPlannerPrompt(query: string, context?: string): string {
  return `You are a research query planner. Your job is to break down complex research topics into 2-5 specific search queries that together will provide comprehensive coverage.

**Research Topic**: ${query}
${context ? `**Context**: ${context}` : ''}

**Instructions**:
1. Identify the core aspects of the topic that need to be researched
2. Create 2-5 focused search queries that cover different angles
3. Each query should be specific and actionable
4. Avoid redundant queries
5. Prioritize queries that will yield the most valuable information

**Output Format** (JSON array):
[
  {
    "query": "specific search query 1",
    "purpose": "why this query is needed"
  },
  {
    "query": "specific search query 2",
    "purpose": "why this query is needed"
  }
]

Return ONLY the JSON array, no additional text.`;
}

/**
 * Relevance Scorer Prompt
 * Scores how relevant a source is to the query
 */
export function buildRelevancePrompt(
  content: string,
  query: string,
  maxLength = 3000
): string {
  const truncatedContent =
    content.length > maxLength ? content.substring(0, maxLength) + '...' : content;

  return `Score the relevance of this content to the research query.

**Query**: ${query}

**Content**:
${truncatedContent}

**Instructions**:
Rate the relevance on a scale of 0.0 to 1.0 where:
- 1.0 = Highly relevant, directly addresses the query
- 0.7-0.9 = Relevant, contains useful information
- 0.4-0.6 = Partially relevant, some useful context
- 0.1-0.3 = Tangentially relevant
- 0.0 = Not relevant at all

**Output Format** (JSON):
{
  "score": 0.0-1.0,
  "reasoning": "brief explanation"
}

Return ONLY the JSON object, no additional text.`;
}

/**
 * Credibility Scorer Prompt
 * Evaluates source credibility based on structure and content
 */
export function buildCredibilityPrompt(
  content: string,
  url: string,
  title?: string,
  maxLength = 3000
): string {
  const truncatedContent =
    content.length > maxLength ? content.substring(0, maxLength) + '...' : content;

  return `Evaluate the credibility of this source.

**URL**: ${url}
${title ? `**Title**: ${title}` : ''}

**Content**:
${truncatedContent}

**Instructions**:
Rate the credibility on a scale of 0.0 to 1.0 based on:
- Domain authority (.edu, .gov, established publications = higher)
- Content quality (well-structured, cited sources = higher)
- Objectivity (balanced perspective = higher)
- Recency (current information = higher for time-sensitive topics)
- Author expertise (if identifiable)

**Output Format** (JSON):
{
  "score": 0.0-1.0,
  "reasoning": "brief explanation",
  "factors": ["factor1", "factor2"]
}

Return ONLY the JSON object, no additional text.`;
}

/**
 * Finding Extractor Prompt
 * Extracts claims and evidence from content
 */
export function buildFindingExtractorPrompt(
  content: string,
  query: string,
  url: string,
  maxLength = 4000
): string {
  const truncatedContent =
    content.length > maxLength ? content.substring(0, maxLength) + '...' : content;

  return `Extract key findings from this source that are relevant to the research query.

**Query**: ${query}
**Source**: ${url}

**Content**:
${truncatedContent}

**Instructions**:
Extract 2-5 key findings where each finding includes:
- A clear claim or statement
- Supporting evidence from the text
- A confidence score (0.0-1.0) based on evidence strength
- A relevant quote (if available)

**Output Format** (JSON array):
[
  {
    "claim": "clear statement of finding",
    "evidence": "supporting evidence or context",
    "confidence": 0.0-1.0,
    "quote": "direct quote if available or null"
  }
]

Return ONLY the JSON array, no additional text.`;
}

/**
 * Synthesizer Prompt
 * Combines findings into coherent summary
 */
export function buildSynthesizerPrompt(
  originalQuery: string,
  findings: Array<{ claim: string; evidence: string; sourceUrl: string; confidence: number }>,
  sources: Array<{ url: string; title: string; keyPoints: string[] }>
): string {
  const findingsText = findings
    .slice(0, 20) // Limit to top 20 findings
    .map(
      (f, i) =>
        `${i + 1}. ${f.claim}\n   Evidence: ${f.evidence}\n   Source: ${f.sourceUrl}\n   Confidence: ${f.confidence}`
    )
    .join('\n\n');

  const sourcesText = sources
    .slice(0, 10) // Limit to top 10 sources
    .map((s, i) => `${i + 1}. [${s.title}](${s.url})\n   Key Points: ${s.keyPoints.join(', ')}`)
    .join('\n\n');

  return `Synthesize research findings into a comprehensive summary.

**Original Query**: ${originalQuery}

**Findings**:
${findingsText}

**Sources**:
${sourcesText}

**Instructions**:
1. Create a clear, well-organized summary (300-500 words)
2. Highlight the most important findings
3. Note any conflicting information or uncertainties
4. Organize by themes or categories if applicable
5. Use markdown formatting for readability
6. Include inline citations using [source number] format

**Output Format** (JSON):
{
  "summary": "comprehensive markdown summary with citations",
  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"],
  "uncertainties": ["any gaps or conflicting info"],
  "citations": ["[1] source description", "[2] source description"]
}

Return ONLY the JSON object, no additional text.`;
}

/**
 * Key Points Extractor Prompt
 * Extracts key points from source for summary
 */
export function buildKeyPointsPrompt(content: string, maxLength = 3000): string {
  const truncatedContent =
    content.length > maxLength ? content.substring(0, maxLength) + '...' : content;

  return `Extract 3-5 key points from this content.

**Content**:
${truncatedContent}

**Instructions**:
Identify the most important facts, insights, or conclusions.
Each point should be concise (1-2 sentences).

**Output Format** (JSON array):
["key point 1", "key point 2", "key point 3"]

Return ONLY the JSON array, no additional text.`;
}
