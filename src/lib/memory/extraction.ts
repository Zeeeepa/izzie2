/**
 * Memory Extraction
 *
 * Extract memories from text (emails, calendar events, etc.) using AI.
 * Memories are distinct from entities - they capture facts, preferences,
 * events, and context that are important for personalization.
 */

import OpenAI from 'openai';
import type {
  ExtractedMemory,
  MemoryExtractionResult,
  MemoryCategory,
  MemorySource,
  DECAY_RATES,
  DEFAULT_IMPORTANCE,
} from './types';
import type { Email } from '../google/types';
import type { UserIdentity } from '../extraction/user-identity';

const LOG_PREFIX = '[MemoryExtraction]';

// Initialize OpenAI client for OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'Izzie2',
  },
});

/**
 * Build memory extraction prompt
 */
function buildMemoryPrompt(
  email: Email,
  userIdentity?: UserIdentity
): string {
  const userContext = userIdentity
    ? `
**USER IDENTITY:**
- User: ${userIdentity.primaryName} (${userIdentity.primaryEmail})
- Aliases: ${userIdentity.aliases.slice(0, 3).join(', ')}
`
    : '';

  return `Extract memories from this email. Memories are facts, preferences, events, and context that are important for understanding the user and their world.

${userContext}
**Email:**
From: ${email.from.name || email.from.email}
To: ${email.to.map((t) => t.name || t.email).join(', ')}
Subject: ${email.subject}
Date: ${email.date.toISOString()}

Body:
${email.body.substring(0, 2000)}

**Memory Categories:**

1. **preference** - User likes/dislikes, habits, preferences
   Examples:
   - "User prefers morning meetings"
   - "John doesn't like coffee"
   - "Team uses Slack for communication"

2. **fact** - Objective information, stable truths
   Examples:
   - "Sarah works in marketing"
   - "Q4 report is due December 31"
   - "Project uses TypeScript and React"

3. **event** - Things that happened or will happen
   Examples:
   - "Team meeting scheduled for Friday at 2pm"
   - "Launch party was successful"
   - "Going on vacation next week"

4. **decision** - Decisions that were made
   Examples:
   - "Decided to use PostgreSQL instead of MongoDB"
   - "Team chose to postpone the release"
   - "Approved budget increase for marketing"

5. **sentiment** - Emotional context, feelings
   Examples:
   - "User is frustrated with slow deployment"
   - "Client is happy with the results"
   - "Team is excited about new feature"

6. **reminder** - Things to remember for later
   Examples:
   - "Need to follow up on proposal"
   - "Remember to book flight for conference"
   - "Check with legal before signing"

7. **relationship** - How entities relate to each other
   Examples:
   - "Sarah reports to Michael"
   - "Client XYZ is considering competitor"
   - "John collaborates with the design team"

**Extraction Rules:**

- Extract 3-10 distinct memories per email
- Each memory should be a complete, standalone fact
- Include importance (0-1): how valuable is this memory?
- Include confidence (0-1): how certain are you about this memory?
- Link to related entities when relevant (person/company names)
- Add tags for searchability
- Set expiresAt for time-sensitive memories (ISO date)
- Focus on actionable, useful information
- Avoid duplicating entity extraction (don't extract names as memories)

**Output Format (JSON):**

{
  "memories": [
    {
      "content": "User prefers async communication over meetings",
      "category": "preference",
      "importance": 0.8,
      "confidence": 0.9,
      "relatedEntities": ["John Doe"],
      "tags": ["communication", "work-style"],
      "expiresAt": null
    },
    {
      "content": "Q4 planning meeting scheduled for next Tuesday at 10am",
      "category": "event",
      "importance": 0.7,
      "confidence": 1.0,
      "relatedEntities": ["Planning Team"],
      "tags": ["meeting", "q4", "planning"],
      "expiresAt": "2026-01-21T10:00:00Z"
    }
  ]
}

Extract memories now:`;
}

/**
 * Parse AI response to extract memories
 */
function parseMemoryResponse(content: string): ExtractedMemory[] {
  try {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`${LOG_PREFIX} No JSON found in response`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      console.error(`${LOG_PREFIX} Invalid response format - no memories array`);
      return [];
    }

    // Validate and normalize each memory
    return parsed.memories
      .filter((m: any) => {
        // Must have content and category
        if (!m.content || !m.category) {
          console.warn(`${LOG_PREFIX} Skipping memory without content/category`);
          return false;
        }

        // Must be a valid category
        const validCategories: MemoryCategory[] = [
          'preference',
          'fact',
          'event',
          'decision',
          'sentiment',
          'reminder',
          'relationship',
        ];
        if (!validCategories.includes(m.category)) {
          console.warn(`${LOG_PREFIX} Invalid category: ${m.category}`);
          return false;
        }

        return true;
      })
      .map((m: any) => ({
        content: m.content,
        category: m.category as MemoryCategory,
        importance: typeof m.importance === 'number' ? m.importance : 0.5,
        confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
        relatedEntities: Array.isArray(m.relatedEntities) ? m.relatedEntities : [],
        tags: Array.isArray(m.tags) ? m.tags : [],
        expiresAt: m.expiresAt ? new Date(m.expiresAt) : undefined,
      }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to parse memory response:`, error);
    return [];
  }
}

/**
 * Extract memories from an email
 */
export async function extractMemoriesFromEmail(
  email: Email,
  userIdentity?: UserIdentity
): Promise<MemoryExtractionResult> {
  console.log(`${LOG_PREFIX} Extracting memories from email: ${email.subject}`);

  const startTime = Date.now();
  const prompt = buildMemoryPrompt(email, userIdentity);

  try {
    const model = 'anthropic/claude-3.5-sonnet';
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content
    const content = response.choices[0]?.message?.content || '';

    // Parse memories
    const memories = parseMemoryResponse(content);

    // Calculate cost (approximate)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    const processingTimeMs = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Extracted ${memories.length} memories in ${processingTimeMs}ms (cost: $${cost.toFixed(6)})`
    );

    return {
      sourceId: email.id,
      sourceType: 'email',
      memories,
      extractedAt: new Date(),
      cost,
      model,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error extracting memories:`, error);

    return {
      sourceId: email.id,
      sourceType: 'email',
      memories: [],
      extractedAt: new Date(),
      cost: 0,
      model: 'error',
    };
  }
}

/**
 * Extract memories from text (generic)
 */
export async function extractMemoriesFromText(
  text: string,
  sourceId: string,
  sourceType: MemorySource,
  userIdentity?: UserIdentity
): Promise<MemoryExtractionResult> {
  // Create a minimal email-like object for extraction
  const pseudoEmail: Email = {
    id: sourceId,
    subject: '',
    body: text,
    snippet: text.substring(0, 500),
    from: { email: 'unknown', name: 'Unknown' },
    to: [],
    date: new Date(),
    threadId: sourceId,
    labels: [],
    isSent: false,
    hasAttachments: false,
    internalDate: Date.now(),
  };

  const result = await extractMemoriesFromEmail(pseudoEmail, userIdentity);

  return {
    ...result,
    sourceId,
    sourceType,
  };
}

/**
 * Batch extract memories from multiple emails
 */
export async function batchExtractMemories(
  emails: Email[],
  userIdentity?: UserIdentity,
  options?: {
    maxConcurrent?: number;
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<MemoryExtractionResult[]> {
  const maxConcurrent = options?.maxConcurrent || 3;
  const results: MemoryExtractionResult[] = [];

  console.log(`${LOG_PREFIX} Batch extracting memories from ${emails.length} emails...`);

  // Process in batches to avoid rate limits
  for (let i = 0; i < emails.length; i += maxConcurrent) {
    const batch = emails.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map((email) => extractMemoriesFromEmail(email, userIdentity))
    );

    results.push(...batchResults);

    if (options?.onProgress) {
      options.onProgress(Math.min(i + maxConcurrent, emails.length), emails.length);
    }

    // Rate limiting: wait 1 second between batches
    if (i + maxConcurrent < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const totalMemories = results.reduce((sum, r) => sum + r.memories.length, 0);
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

  console.log(
    `${LOG_PREFIX} Batch extraction complete: ${totalMemories} memories from ${emails.length} emails (cost: $${totalCost.toFixed(6)})`
  );

  return results;
}
