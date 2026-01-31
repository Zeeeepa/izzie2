/**
 * Training Data Exporter
 *
 * Exports feedback and extraction data in formats suitable for ML training:
 * - JSONL: Generic line-delimited JSON format
 * - OpenAI: Fine-tuning format for GPT models
 * - Anthropic: Training format for Claude models
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FeedbackRecord } from './feedback';
import { getFeedbackService, FeedbackService } from './feedback';
import type { FewShotExample, EntityFewShotExample, RelationshipFewShotExample } from './few-shot-generator';
import { getFewShotGenerator, FewShotGenerator } from './few-shot-generator';

const LOG_PREFIX = '[TrainingExport]';

/**
 * Export format types
 */
export type ExportFormat = 'jsonl' | 'openai' | 'anthropic';

/**
 * OpenAI fine-tuning message format
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI fine-tuning example format
 */
interface OpenAITrainingExample {
  messages: OpenAIMessage[];
}

/**
 * Anthropic training example format
 */
interface AnthropicTrainingExample {
  prompt: string;
  completion: string;
}

/**
 * Generic JSONL training record
 */
interface JSONLTrainingRecord {
  id: string;
  timestamp: string;
  type: 'entity' | 'relationship';
  input: {
    emailContext: {
      subject?: string;
      from?: string;
      snippet?: string;
    };
    extractedValue: string;
    extractedType: string;
  };
  output: {
    isCorrect: boolean;
    correction?: string;
    correctType?: string;
    correctValue?: string;
  };
  metadata: {
    confidence?: number;
    source?: string;
  };
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Output file path (without extension) */
  outputPath?: string;
  /** Export format(s) to generate */
  formats?: ExportFormat[];
  /** Include positive feedback as well as negative */
  includePositive?: boolean;
  /** Maximum examples per file */
  maxExamples?: number;
  /** Date range start */
  startDate?: Date;
  /** Date range end */
  endDate?: Date;
  /** System prompt for OpenAI/Anthropic formats */
  systemPrompt?: string;
}

/**
 * Export result with file paths
 */
export interface ExportResult {
  format: ExportFormat;
  filePath: string;
  recordCount: number;
  success: boolean;
  error?: string;
}

export class TrainingExporter {
  private feedbackService: FeedbackService;
  private fewShotGenerator: FewShotGenerator;
  private dataDir: string;

  constructor(feedbackService?: FeedbackService, dataDir?: string) {
    this.feedbackService = feedbackService || getFeedbackService();
    this.fewShotGenerator = getFewShotGenerator(this.feedbackService);
    this.dataDir = dataDir || path.join(process.cwd(), 'data', 'training');
    console.log(`${LOG_PREFIX} Initialized with data directory: ${this.dataDir}`);
  }

  /**
   * Export training data in specified formats
   */
  async export(options: ExportOptions = {}): Promise<ExportResult[]> {
    const {
      outputPath,
      formats = ['jsonl'],
      includePositive = false,
      maxExamples,
      startDate,
      endDate,
      systemPrompt = this.getDefaultSystemPrompt(),
    } = options;

    // Ensure output directory exists
    const baseDir = outputPath ? path.dirname(outputPath) : this.dataDir;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    // Get base filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = outputPath
      ? path.basename(outputPath, path.extname(outputPath))
      : `training_${timestamp}`;
    const baseOutputPath = path.join(baseDir, baseName);

    // Get feedback records
    let records = this.feedbackService.getAllRecords();
    console.log(`${LOG_PREFIX} Processing ${records.length} feedback records`);

    // Filter by feedback type
    if (!includePositive) {
      records = records.filter((r) => r.feedback === 'negative');
    }

    // Filter by date range
    if (startDate) {
      records = records.filter((r) => new Date(r.timestamp) >= startDate);
    }
    if (endDate) {
      records = records.filter((r) => new Date(r.timestamp) <= endDate);
    }

    // Limit examples
    if (maxExamples && records.length > maxExamples) {
      records = records.slice(0, maxExamples);
    }

    console.log(`${LOG_PREFIX} Exporting ${records.length} records`);

    // Export in each format
    const results: ExportResult[] = [];

    for (const format of formats) {
      const result = await this.exportFormat(
        records,
        format,
        baseOutputPath,
        systemPrompt
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Export in a specific format
   */
  private async exportFormat(
    records: FeedbackRecord[],
    format: ExportFormat,
    baseOutputPath: string,
    systemPrompt: string
  ): Promise<ExportResult> {
    const filePath = `${baseOutputPath}.${format === 'jsonl' ? 'jsonl' : format + '.jsonl'}`;

    try {
      let content: string;

      switch (format) {
        case 'jsonl':
          content = this.toJSONL(records);
          break;
        case 'openai':
          content = this.toOpenAI(records, systemPrompt);
          break;
        case 'anthropic':
          content = this.toAnthropic(records, systemPrompt);
          break;
        default:
          throw new Error(`Unknown format: ${format}`);
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`${LOG_PREFIX} Exported ${records.length} records to ${filePath}`);

      return {
        format,
        filePath,
        recordCount: records.length,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Failed to export ${format}:`, error);

      return {
        format,
        filePath,
        recordCount: 0,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert feedback records to generic JSONL format
   */
  toJSONL(records: FeedbackRecord[]): string {
    const jsonlRecords: JSONLTrainingRecord[] = records.map((record) => ({
      id: record.id,
      timestamp: record.timestamp,
      type: record.type,
      input: {
        emailContext: {
          subject: record.context.emailSubject,
          from: record.context.emailFrom,
          snippet: record.context.emailSnippet,
        },
        extractedValue: record.extracted.value,
        extractedType: record.type === 'entity'
          ? record.extracted.entityType || 'unknown'
          : record.extracted.relationshipType || 'unknown',
      },
      output: {
        isCorrect: record.feedback === 'positive',
        correction: record.correction,
        correctType: this.parseCorrection(record)?.type,
        correctValue: this.parseCorrection(record)?.value,
      },
      metadata: {
        confidence: record.extracted.confidence,
        source: record.extracted.source,
      },
    }));

    return jsonlRecords.map((r) => JSON.stringify(r)).join('\n');
  }

  /**
   * Convert feedback records to OpenAI fine-tuning format
   */
  toOpenAI(records: FeedbackRecord[], systemPrompt: string): string {
    const examples: OpenAITrainingExample[] = records.map((record) => {
      const userMessage = this.formatUserMessage(record);
      const assistantMessage = this.formatAssistantMessage(record);

      return {
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userMessage },
          { role: 'assistant' as const, content: assistantMessage },
        ],
      };
    });

    return examples.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Convert feedback records to Anthropic training format
   */
  toAnthropic(records: FeedbackRecord[], systemPrompt: string): string {
    const examples: AnthropicTrainingExample[] = records.map((record) => {
      const userMessage = this.formatUserMessage(record);
      const assistantMessage = this.formatAssistantMessage(record);

      // Anthropic format uses Human/Assistant format with system prepended
      const prompt = `${systemPrompt}\n\nHuman: ${userMessage}\n\nAssistant:`;
      const completion = ` ${assistantMessage}`;

      return { prompt, completion };
    });

    return examples.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Format user message for training (the extraction context)
   */
  private formatUserMessage(record: FeedbackRecord): string {
    const parts: string[] = [];

    parts.push('Review this extraction:');
    parts.push('');

    // Email context
    if (record.context.emailFrom) {
      parts.push(`From: ${record.context.emailFrom}`);
    }
    if (record.context.emailSubject) {
      parts.push(`Subject: ${record.context.emailSubject}`);
    }
    if (record.context.emailSnippet) {
      parts.push(`Content: "${record.context.emailSnippet}"`);
    }
    parts.push('');

    // Extraction
    if (record.type === 'entity') {
      parts.push(`Extracted ${record.extracted.entityType || 'entity'}: "${record.extracted.value}"`);
      if (record.extracted.confidence) {
        parts.push(`Confidence: ${(record.extracted.confidence * 100).toFixed(0)}%`);
      }
    } else {
      parts.push(`Extracted relationship: ${record.extracted.source} -[${record.extracted.relationshipType}]-> ${record.extracted.target}`);
      if (record.extracted.confidence) {
        parts.push(`Confidence: ${(record.extracted.confidence * 100).toFixed(0)}%`);
      }
    }

    parts.push('');
    parts.push('Is this extraction correct? If not, what should it be?');

    return parts.join('\n');
  }

  /**
   * Format assistant message for training (the correction)
   */
  private formatAssistantMessage(record: FeedbackRecord): string {
    if (record.feedback === 'positive') {
      return 'This extraction is correct.';
    }

    const parts: string[] = ['This extraction is incorrect.'];

    if (record.correction) {
      const parsed = this.parseCorrection(record);
      if (parsed) {
        if (parsed.type === 'DELETE') {
          parts.push('This should not have been extracted.');
        } else if (record.type === 'entity') {
          parts.push(`The correct extraction is: ${parsed.type}: "${parsed.value}"`);
        } else {
          parts.push(`The correct relationship is: ${parsed.value}`);
        }
      } else {
        parts.push(`Correction: ${record.correction}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Parse correction string to extract type and value
   */
  private parseCorrection(record: FeedbackRecord): { type: string; value: string } | null {
    if (!record.correction) {
      return null;
    }

    const correction = record.correction.trim();

    if (correction.toUpperCase() === 'DELETE') {
      return { type: 'DELETE', value: '' };
    }

    // For entities: "type:value" or just "value"
    if (record.type === 'entity') {
      const colonIndex = correction.indexOf(':');
      if (colonIndex > 0) {
        return {
          type: correction.substring(0, colonIndex).trim(),
          value: correction.substring(colonIndex + 1).trim(),
        };
      }
      return {
        type: record.extracted.entityType || 'unknown',
        value: correction,
      };
    }

    // For relationships: keep as-is
    return {
      type: record.extracted.relationshipType || 'unknown',
      value: correction,
    };
  }

  /**
   * Get default system prompt for training
   */
  private getDefaultSystemPrompt(): string {
    return `You are an AI assistant that extracts entities and relationships from emails.

Your task is to identify:
- People (names, roles)
- Companies/Organizations
- Projects
- Tools (software, platforms, APIs)
- Topics
- Locations
- Action items

And relationships between them:
- WORKS_WITH, REPORTS_TO, WORKS_FOR (professional)
- LEADS, WORKS_ON (project involvement)
- FRIEND_OF, FAMILY_OF (personal)
- PARTNERS_WITH, COMPETES_WITH (business)

Be precise and avoid over-extraction. Only extract entities and relationships that are clearly mentioned or strongly implied in the email content.`;
  }

  /**
   * Export few-shot examples directly (not from raw feedback)
   */
  exportFewShotExamples(
    examples: FewShotExample[],
    outputPath: string,
    format: ExportFormat = 'jsonl'
  ): ExportResult {
    const filePath = `${outputPath}.${format === 'jsonl' ? 'jsonl' : format + '.jsonl'}`;

    try {
      let content: string;

      switch (format) {
        case 'jsonl':
          content = examples.map((e) => JSON.stringify(e)).join('\n');
          break;
        case 'openai':
          content = this.fewShotToOpenAI(examples);
          break;
        case 'anthropic':
          content = this.fewShotToAnthropic(examples);
          break;
        default:
          throw new Error(`Unknown format: ${format}`);
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`${LOG_PREFIX} Exported ${examples.length} few-shot examples to ${filePath}`);

      return {
        format,
        filePath,
        recordCount: examples.length,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Failed to export few-shot examples:`, error);

      return {
        format,
        filePath,
        recordCount: 0,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert few-shot examples to OpenAI format
   */
  private fewShotToOpenAI(examples: FewShotExample[]): string {
    const systemPrompt = this.getDefaultSystemPrompt();

    const openaiExamples: OpenAITrainingExample[] = examples.map((example) => {
      let userContent: string;
      let assistantContent: string;

      if (example.type === 'entity') {
        userContent = this.formatEntityUserContent(example);
        assistantContent = this.formatEntityAssistantContent(example);
      } else {
        userContent = this.formatRelationshipUserContent(example);
        assistantContent = this.formatRelationshipAssistantContent(example);
      }

      return {
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userContent },
          { role: 'assistant' as const, content: assistantContent },
        ],
      };
    });

    return openaiExamples.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Convert few-shot examples to Anthropic format
   */
  private fewShotToAnthropic(examples: FewShotExample[]): string {
    const systemPrompt = this.getDefaultSystemPrompt();

    const anthropicExamples: AnthropicTrainingExample[] = examples.map((example) => {
      let userContent: string;
      let assistantContent: string;

      if (example.type === 'entity') {
        userContent = this.formatEntityUserContent(example);
        assistantContent = this.formatEntityAssistantContent(example);
      } else {
        userContent = this.formatRelationshipUserContent(example);
        assistantContent = this.formatRelationshipAssistantContent(example);
      }

      return {
        prompt: `${systemPrompt}\n\nHuman: ${userContent}\n\nAssistant:`,
        completion: ` ${assistantContent}`,
      };
    });

    return anthropicExamples.map((e) => JSON.stringify(e)).join('\n');
  }

  private formatEntityUserContent(example: EntityFewShotExample): string {
    const parts: string[] = ['Review this entity extraction:'];

    if (example.context.from) parts.push(`From: ${example.context.from}`);
    if (example.context.subject) parts.push(`Subject: ${example.context.subject}`);
    if (example.context.snippet) parts.push(`Content: "${example.context.snippet}"`);

    parts.push(`Extracted: ${example.incorrectExtraction.type}: "${example.incorrectExtraction.value}"`);
    parts.push('Is this correct?');

    return parts.join('\n');
  }

  private formatEntityAssistantContent(example: EntityFewShotExample): string {
    if (example.correctExtraction.value === '') {
      return 'Incorrect. This should not have been extracted.';
    }
    return `Incorrect. The correct extraction is: ${example.correctExtraction.type}: "${example.correctExtraction.value}"`;
  }

  private formatRelationshipUserContent(example: RelationshipFewShotExample): string {
    const parts: string[] = ['Review this relationship extraction:'];

    if (example.context.from) parts.push(`From: ${example.context.from}`);
    if (example.context.subject) parts.push(`Subject: ${example.context.subject}`);
    if (example.context.snippet) parts.push(`Content: "${example.context.snippet}"`);

    parts.push(`Extracted: ${example.incorrectExtraction.source} -[${example.incorrectExtraction.relationshipType}]-> ${example.incorrectExtraction.target}`);
    parts.push('Is this correct?');

    return parts.join('\n');
  }

  private formatRelationshipAssistantContent(example: RelationshipFewShotExample): string {
    if (!example.correctExtraction) {
      return 'Incorrect. This relationship should not have been extracted.';
    }
    return `Incorrect. The correct relationship is: ${example.correctExtraction.source} -[${example.correctExtraction.relationshipType}]-> ${example.correctExtraction.target}`;
  }

  /**
   * Get export statistics
   */
  getStats(): {
    feedbackRecords: number;
    negativeFeedback: number;
    withCorrections: number;
    availableFormats: ExportFormat[];
  } {
    const records = this.feedbackService.getAllRecords();
    const negative = records.filter((r) => r.feedback === 'negative');
    const withCorrections = negative.filter((r) => r.correction && r.correction.trim().length > 0);

    return {
      feedbackRecords: records.length,
      negativeFeedback: negative.length,
      withCorrections: withCorrections.length,
      availableFormats: ['jsonl', 'openai', 'anthropic'],
    };
  }
}

// Singleton instance
let trainingExporterInstance: TrainingExporter | null = null;

export function getTrainingExporter(
  feedbackService?: FeedbackService,
  dataDir?: string
): TrainingExporter {
  if (!trainingExporterInstance || feedbackService || dataDir) {
    trainingExporterInstance = new TrainingExporter(feedbackService, dataDir);
  }
  return trainingExporterInstance;
}
