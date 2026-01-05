/**
 * Query Parser
 *
 * Parses natural language queries to extract intent, entities, and keywords.
 * Routes queries to appropriate retrieval strategies.
 */

import type { ParsedQuery, QueryType } from './types';

/**
 * Common question words for different query types
 */
const QUERY_PATTERNS: Record<QueryType, RegExp[]> = {
  factual: [
    /^what (is|are|was|were)/i,
    /^tell me about/i,
    /^explain/i,
    /^describe/i,
    /^define/i,
  ],
  relational: [
    /^who (works|worked|collaborates|collaborated) with/i,
    /^what.*related to/i,
    /^find (people|connections|relationships)/i,
    /^who knows about/i,
    /^experts? (on|in|for)/i,
  ],
  temporal: [
    /^recent/i,
    /^latest/i,
    /^last (week|month|year|day)/i,
    /^(today|yesterday|this week)/i,
    /^updates? (from|since)/i,
    /^what.*recently/i,
  ],
  exploratory: [
    /^show me (everything|all)/i,
    /^explore/i,
    /^browse/i,
    /^discover/i,
  ],
  semantic: [], // Default fallback
};

/**
 * Stop words to filter from keywords
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'who',
  'what',
  'when',
  'where',
  'how',
  'why',
  'about',
  'tell',
  'me',
  'find',
  'show',
  'get',
]);

/**
 * Temporal patterns for date extraction
 */
const TEMPORAL_PATTERNS: Record<string, (now: Date) => { from?: Date; to?: Date }> = {
  recent: (now) => ({
    from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    to: now,
  }),
  today: (now) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  },
  yesterday: (now) => {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  },
  'this week': (now) => {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  },
  'last week': (now) => {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  },
  'last month': (now) => {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  },
};

/**
 * Parse a natural language query
 */
export function parseQuery(query: string): ParsedQuery {
  const normalized = query.trim().toLowerCase();

  // 1. Detect query type
  const type = detectQueryType(normalized);

  // 2. Extract entities (capitalized words, quoted strings)
  const entities = extractEntities(query);

  // 3. Extract keywords
  const keywords = extractKeywords(normalized);

  // 4. Extract temporal constraints
  const temporal = extractTemporal(normalized);

  // 5. Determine intent
  const intent = determineIntent(type, entities, keywords);

  // 6. Calculate confidence
  const confidence = calculateConfidence(type, entities, keywords);

  return {
    original: query,
    type,
    entities,
    keywords,
    intent,
    temporal,
    confidence,
  };
}

/**
 * Detect query type based on patterns
 */
function detectQueryType(query: string): QueryType {
  for (const [type, patterns] of Object.entries(QUERY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        return type as QueryType;
      }
    }
  }

  // Default to semantic search
  return 'semantic';
}

/**
 * Extract entity names from query
 * Looks for:
 * - Capitalized words (likely proper nouns)
 * - Quoted strings
 * - Common entity patterns
 */
function extractEntities(query: string): string[] {
  const entities: string[] = [];

  // Extract quoted strings
  const quotedMatches = query.match(/"([^"]+)"/g);
  if (quotedMatches) {
    entities.push(...quotedMatches.map((m) => m.replace(/"/g, '')));
  }

  // Extract capitalized words (but not at sentence start)
  const words = query.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    // Check if word starts with capital letter and has at least 2 characters
    if (/^[A-Z][a-z]+/.test(word) && word.length >= 2) {
      entities.push(word);
    }
  }

  // Remove duplicates and normalize
  return [...new Set(entities)].map((e) => e.trim());
}

/**
 * Extract keywords from query
 * Filters stop words and extracts meaningful terms
 */
function extractKeywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\w]/g, '')) // Remove punctuation
    .filter((w) => w.length > 2) // Min 3 characters
    .filter((w) => !STOP_WORDS.has(w)); // Remove stop words

  // Remove duplicates
  return [...new Set(words)];
}

/**
 * Extract temporal constraints from query
 */
function extractTemporal(
  query: string
): ParsedQuery['temporal'] | undefined {
  const now = new Date();

  for (const [pattern, dateFunc] of Object.entries(TEMPORAL_PATTERNS)) {
    if (query.includes(pattern)) {
      const dates = dateFunc(now);
      return {
        ...dates,
        relative: pattern,
      };
    }
  }

  return undefined;
}

/**
 * Determine natural language intent
 */
function determineIntent(
  type: QueryType,
  entities: string[],
  keywords: string[]
): string {
  const entityStr = entities.length > 0 ? entities.join(', ') : 'general';
  const keywordStr = keywords.slice(0, 3).join(', ');

  switch (type) {
    case 'factual':
      return `Find factual information about: ${entityStr}`;
    case 'relational':
      return `Find relationships and connections for: ${entityStr}`;
    case 'temporal':
      return `Find recent activity related to: ${keywordStr}`;
    case 'exploratory':
      return `Explore all information about: ${entityStr}`;
    case 'semantic':
    default:
      return `Find semantically similar content for: ${keywordStr}`;
  }
}

/**
 * Calculate confidence in query parsing
 * Higher confidence when:
 * - Query type is clearly identified
 * - Entities are extracted
 * - Keywords are meaningful
 */
function calculateConfidence(
  type: QueryType,
  entities: string[],
  keywords: string[]
): number {
  let confidence = 0.5; // Base confidence

  // Type detection confidence
  if (type !== 'semantic') {
    confidence += 0.2; // Matched a specific pattern
  }

  // Entity extraction confidence
  if (entities.length > 0) {
    confidence += 0.15 * Math.min(entities.length, 2); // Up to 0.3 for 2+ entities
  }

  // Keyword confidence
  if (keywords.length >= 2) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Suggest retrieval strategy based on parsed query
 */
export function suggestStrategy(parsed: ParsedQuery): {
  vectorWeight: number;
  graphWeight: number;
  useRecencyBoost: boolean;
} {
  switch (parsed.type) {
    case 'relational':
      // Graph-heavy for relationship queries
      return {
        vectorWeight: 0.3,
        graphWeight: 0.7,
        useRecencyBoost: false,
      };

    case 'temporal':
      // Vector-heavy with recency boost
      return {
        vectorWeight: 0.8,
        graphWeight: 0.2,
        useRecencyBoost: true,
      };

    case 'exploratory':
      // Balanced with broader results
      return {
        vectorWeight: 0.5,
        graphWeight: 0.5,
        useRecencyBoost: false,
      };

    case 'factual':
      // Vector-heavy for semantic matching
      return {
        vectorWeight: 0.7,
        graphWeight: 0.3,
        useRecencyBoost: false,
      };

    case 'semantic':
    default:
      // Default balanced approach
      return {
        vectorWeight: 0.6,
        graphWeight: 0.4,
        useRecencyBoost: false,
      };
  }
}
