/**
 * Document Classifier
 *
 * Classifies Google Drive documents into types (meeting notes, specifications, reports, etc.)
 * using pattern matching and AI classification.
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import type {
  DocumentType,
  DocumentClassification,
  DocumentStructure,
  Heading,
  Section,
} from './types';

const LOG_PREFIX = '[DocumentClassifier]';

/**
 * Pattern indicators for each document type
 */
const DOCUMENT_TYPE_PATTERNS = {
  meeting_notes: {
    keywords: [
      'meeting',
      'attendees',
      'agenda',
      'action items',
      'minutes',
      'discussion',
      'notes from',
      'standup',
      'sync',
    ],
    titlePatterns: [
      /meeting.*notes?/i,
      /notes.*meeting/i,
      /\d{4}-\d{2}-\d{2}.*meeting/i,
      /standup/i,
      /daily sync/i,
      /weekly sync/i,
    ],
    structurePatterns: ['attendees:', 'agenda:', 'action items:', 'decisions:'],
  },
  specification: {
    keywords: [
      'requirements',
      'specification',
      'architecture',
      'design',
      'technical',
      'implementation',
      'api',
      'system',
    ],
    titlePatterns: [
      /spec(ification)?/i,
      /requirements?/i,
      /design doc/i,
      /technical.*design/i,
      /architecture/i,
      /api.*spec/i,
    ],
    structurePatterns: [
      'requirements',
      'technical details',
      'implementation',
      'dependencies',
      'architecture',
    ],
  },
  report: {
    keywords: [
      'report',
      'analysis',
      'findings',
      'summary',
      'conclusion',
      'results',
      'metrics',
      'data',
      'insights',
    ],
    titlePatterns: [
      /report/i,
      /analysis/i,
      /findings/i,
      /summary/i,
      /\d{4}.*Q\d/i, // Quarterly reports
      /monthly.*report/i,
      /weekly.*report/i,
    ],
    structurePatterns: ['executive summary', 'findings', 'conclusions', 'recommendations'],
  },
  presentation: {
    keywords: ['slide', 'deck', 'presentation', 'pitch', 'overview'],
    titlePatterns: [/presentation/i, /deck/i, /slides?/i, /pitch/i, /overview/i],
    structurePatterns: ['slide', 'agenda', 'overview', 'next steps'],
  },
  proposal: {
    keywords: ['proposal', 'project plan', 'roadmap', 'initiative', 'rfc'],
    titlePatterns: [/proposal/i, /project.*plan/i, /roadmap/i, /rfc/i, /initiative/i],
    structurePatterns: ['objective', 'scope', 'timeline', 'resources', 'budget'],
  },
} as const;

export class DocumentClassifier {
  private _client: ReturnType<typeof getAIClient> | null = null;

  // Lazy getter for AI client (for build compatibility)
  private get client() {
    if (!this._client) {
      this._client = getAIClient();
    }
    return this._client;
  }

  /**
   * Classify document using pattern matching and AI
   */
  async classify(
    fileName: string,
    content: string,
    mimeType: string,
    useAI = true
  ): Promise<DocumentClassification> {
    // Try pattern-based classification first (fast and cheap)
    const patternResult = this.classifyByPatterns(fileName, content);

    // If high confidence, return pattern result
    if (patternResult.confidence >= 0.8) {
      console.log(
        `${LOG_PREFIX} High confidence pattern match: ${patternResult.type} (${patternResult.confidence})`
      );
      return patternResult;
    }

    // Use AI for ambiguous cases
    if (useAI && patternResult.confidence < 0.8) {
      console.log(
        `${LOG_PREFIX} Low confidence (${patternResult.confidence}), using AI classification`
      );
      return this.classifyWithAI(fileName, content, mimeType);
    }

    return patternResult;
  }

  /**
   * Pattern-based classification (fast and free)
   */
  private classifyByPatterns(fileName: string, content: string): DocumentClassification {
    const scores: Record<DocumentType, number> = {
      meeting_notes: 0,
      specification: 0,
      report: 0,
      presentation: 0,
      proposal: 0,
      other: 0,
    };

    const indicators: string[] = [];
    const contentLower = content.toLowerCase();

    // Check each document type
    for (const [type, patterns] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
      const docType = type as keyof typeof DOCUMENT_TYPE_PATTERNS;

      // Check title patterns
      for (const titlePattern of patterns.titlePatterns) {
        if (titlePattern.test(fileName)) {
          scores[docType] += 30;
          indicators.push(`Title matches ${docType}: "${fileName}"`);
        }
      }

      // Check keywords in content
      for (const keyword of patterns.keywords) {
        const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = contentLower.match(keywordRegex);
        if (matches) {
          scores[docType] += matches.length * 5;
          if (matches.length > 0) {
            indicators.push(`Found keyword "${keyword}" (${matches.length}x)`);
          }
        }
      }

      // Check structure patterns
      for (const structurePattern of patterns.structurePatterns) {
        if (contentLower.includes(structurePattern.toLowerCase())) {
          scores[docType] += 15;
          indicators.push(`Found structure pattern: "${structurePattern}"`);
        }
      }
    }

    // Find type with highest score
    const entries = Object.entries(scores) as [DocumentType, number][];
    const [bestType, bestScore] = entries.reduce((a, b) => (a[1] > b[1] ? a : b));

    // Calculate confidence (normalize score to 0-1)
    const maxPossibleScore = 100; // Rough estimate
    const confidence = Math.min(bestScore / maxPossibleScore, 1.0);

    return {
      type: confidence > 0.3 ? bestType : 'other',
      confidence,
      indicators: indicators.slice(0, 5), // Top 5 indicators
    };
  }

  /**
   * AI-based classification using Mistral
   */
  private async classifyWithAI(
    fileName: string,
    content: string,
    mimeType: string
  ): Promise<DocumentClassification> {
    try {
      // Truncate content for classification
      const contentPreview = content.slice(0, 2000);

      const prompt = `Classify this document into one of these types:
- meeting_notes: Meeting notes with attendees, agenda, action items
- specification: Technical specifications, requirements, design docs
- report: Reports with findings, analysis, conclusions
- presentation: Presentations, slides, pitch decks
- proposal: Proposals, project plans, roadmaps
- other: Other document types

**File Name:** ${fileName}
**MIME Type:** ${mimeType}
**Content Preview:**
${contentPreview}

Respond with JSON only:
{
  "type": "meeting_notes",
  "confidence": 0.95,
  "reasoning": "Contains attendees list, action items, and meeting date"
}`;

      const response = await this.client.chat(
        [
          {
            role: 'system',
            content: 'You are a document classification expert. Respond with JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          model: MODELS.CLASSIFIER, // Mistral Small
          maxTokens: 200,
          temperature: 0.1,
          logCost: false,
        }
      );

      const parsed = this.parseClassificationResponse(response.content);

      return {
        type: parsed.type,
        confidence: parsed.confidence,
        indicators: [parsed.reasoning || 'AI classification'],
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} AI classification failed:`, error);
      // Fall back to pattern-based
      return this.classifyByPatterns(fileName, content);
    }
  }

  /**
   * Extract document structure (headings, sections)
   */
  extractStructure(content: string, mimeType: string): DocumentStructure {
    const headings = this.extractHeadings(content);
    const sections = this.extractSections(content, headings);

    return {
      headings,
      sections,
    };
  }

  /**
   * Extract headings from content
   * Supports markdown (#) and common heading patterns
   */
  private extractHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    const lines = content.split('\n');
    let position = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Markdown headings (# heading)
      const markdownMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (markdownMatch) {
        headings.push({
          level: markdownMatch[1].length,
          text: markdownMatch[2],
          position,
        });
      }

      // ALL CAPS headings (common in plain text)
      else if (trimmed.length > 0 && trimmed === trimmed.toUpperCase() && trimmed.length < 100) {
        // Likely a heading
        headings.push({
          level: 1,
          text: trimmed,
          position,
        });
      }

      // Common heading patterns
      else if (this.isLikelyHeading(trimmed)) {
        headings.push({
          level: 2,
          text: trimmed,
          position,
        });
      }

      position += line.length + 1; // +1 for newline
    }

    return headings;
  }

  /**
   * Check if line is likely a heading
   */
  private isLikelyHeading(line: string): boolean {
    // Common heading patterns
    const patterns = [
      /^(agenda|attendees|action items|decisions|summary|overview|introduction|conclusion|recommendations|findings|requirements|objectives?|scope|timeline|background):/i,
      /^\d+\.\s+[A-Z]/, // Numbered headings
      /^[A-Z][^.!?]*:$/, // Title Case ending with colon
    ];

    return patterns.some((pattern) => pattern.test(line));
  }

  /**
   * Extract sections based on headings
   */
  private extractSections(content: string, headings: Heading[]): Section[] {
    if (headings.length === 0) {
      return [
        {
          content: content,
          startPosition: 0,
          endPosition: content.length,
        },
      ];
    }

    const sections: Section[] = [];

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextHeading = headings[i + 1];

      const startPos = heading.position;
      const endPos = nextHeading ? nextHeading.position : content.length;

      sections.push({
        heading,
        content: content.slice(startPos, endPos).trim(),
        startPosition: startPos,
        endPosition: endPos,
      });
    }

    return sections;
  }

  /**
   * Parse JSON response from AI
   */
  private parseClassificationResponse(content: string): {
    type: DocumentType;
    confidence: number;
    reasoning?: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { type: 'other', confidence: 0.5 };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        type: parsed.type || 'other',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to parse classification response:`, error);
      return { type: 'other', confidence: 0.5 };
    }
  }
}

/**
 * Singleton instance
 */
let classifierInstance: DocumentClassifier | null = null;

export function getDocumentClassifier(): DocumentClassifier {
  if (!classifierInstance) {
    classifierInstance = new DocumentClassifier();
  }
  return classifierInstance;
}
