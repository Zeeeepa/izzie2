/**
 * Drive Entity Extractor
 *
 * Enhanced entity extraction for Google Drive documents with
 * document-type-aware extraction and metadata linking.
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import type { DriveFile } from '@/lib/google/types';
import { getDocumentClassifier } from './document-classifier';
import { buildDriveExtractionPrompt } from './prompts';
import type {
  DriveEntity,
  DriveExtractionResult,
  DriveExtractionConfig,
  DocumentType,
} from './types';
import { DEFAULT_DRIVE_EXTRACTION_CONFIG } from './types';

const LOG_PREFIX = '[DriveExtractor]';

export class DriveEntityExtractor {
  private config: DriveExtractionConfig;
  private client = getAIClient();
  private classifier = getDocumentClassifier();

  constructor(config?: Partial<DriveExtractionConfig>) {
    this.config = {
      ...DEFAULT_DRIVE_EXTRACTION_CONFIG,
      ...config,
    };
  }

  /**
   * Extract entities from Drive document
   */
  async extractFromDocument(file: DriveFile, content: string): Promise<DriveExtractionResult> {
    const startTime = Date.now();

    console.log(`${LOG_PREFIX} Extracting entities from ${file.name}`);

    // Step 1: Classify document type
    const classification = this.config.classifyDocument
      ? await this.classifier.classify(file.name, content, file.mimeType)
      : { type: 'other' as DocumentType, confidence: 0, indicators: [] };

    console.log(
      `${LOG_PREFIX} Document classified as: ${classification.type} (${classification.confidence})`
    );

    // Step 2: Extract document structure
    const structure = this.config.extractStructure
      ? this.classifier.extractStructure(content, file.mimeType)
      : { headings: [], sections: [] };

    console.log(`${LOG_PREFIX} Found ${structure.headings.length} headings`);

    // Step 3: Extract entities from metadata
    const metadataEntities = this.config.extractFromMetadata
      ? this.extractFromMetadata(file)
      : [];

    console.log(`${LOG_PREFIX} Extracted ${metadataEntities.length} entities from metadata`);

    // Step 4: Extract entities from content using AI
    const contentEntities = await this.extractFromContent(
      file,
      content,
      classification.type,
      structure
    );

    console.log(`${LOG_PREFIX} Extracted ${contentEntities.length} entities from content`);

    // Step 5: Merge and deduplicate entities
    const allEntities = [...metadataEntities, ...contentEntities];
    const deduplicatedEntities = this.deduplicateEntities(allEntities);

    console.log(`${LOG_PREFIX} Final count: ${deduplicatedEntities.length} unique entities`);

    const processingTimeMs = Date.now() - startTime;
    console.log(`${LOG_PREFIX} Processing time: ${processingTimeMs}ms`);

    return {
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      classification,
      structure,
      entities: deduplicatedEntities,
      extractedAt: new Date(),
      cost: 0.001, // Estimated cost for Mistral Small
      model: MODELS.CLASSIFIER,
    };
  }

  /**
   * Extract entities from file metadata (owners, collaborators)
   */
  private extractFromMetadata(file: DriveFile): DriveEntity[] {
    const entities: DriveEntity[] = [];

    // Extract owner as person entity
    for (const owner of file.owners) {
      entities.push({
        type: 'person',
        value: owner.displayName || owner.emailAddress,
        normalized: this.normalizeEntityName(owner.displayName || owner.emailAddress),
        confidence: 1.0, // High confidence for metadata
        source: 'metadata',
        context: `Document owner: ${owner.emailAddress}`,
        documentSection: 'metadata',
        isFromMetadata: true,
      });
    }

    // Extract collaborators as person entities
    if (this.config.extractFromCollaborators && file.permissions) {
      const collaborators = file.permissions
        .filter((p) => p.type === 'user' && !p.deleted)
        .slice(0, 20); // Limit to 20 collaborators

      for (const collaborator of collaborators) {
        if (!collaborator.emailAddress) continue;

        // Skip if same as owner
        const isOwner = file.owners.some((o) => o.emailAddress === collaborator.emailAddress);
        if (isOwner) continue;

        entities.push({
          type: 'person',
          value: collaborator.displayName || collaborator.emailAddress,
          normalized: this.normalizeEntityName(
            collaborator.displayName || collaborator.emailAddress
          ),
          confidence: 0.95, // Slightly lower than owner
          source: 'metadata',
          context: `Collaborator (${collaborator.role}): ${collaborator.emailAddress}`,
          documentSection: 'metadata',
          isFromMetadata: true,
          isFromCollaborator: true,
        });
      }
    }

    return entities;
  }

  /**
   * Extract entities from document content using AI
   */
  private async extractFromContent(
    file: DriveFile,
    content: string,
    documentType: DocumentType,
    structure: any
  ): Promise<DriveEntity[]> {
    try {
      // Build extraction prompt
      const prompt = buildDriveExtractionPrompt(
        file,
        content,
        documentType,
        structure,
        this.config
      );

      // Call Mistral for entity extraction
      const response = await this.client.chat(
        [
          {
            role: 'system',
            content:
              'You are an expert entity extraction system for documents. Extract structured entities and respond with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          model: MODELS.CLASSIFIER, // Mistral Small
          maxTokens: 2000,
          temperature: 0.1,
          logCost: false,
        }
      );

      // Parse response
      const parsed = this.parseExtractionResponse(response.content);

      // Filter by confidence threshold
      const filteredEntities = parsed.entities.filter(
        (entity) => entity.confidence >= this.config.minConfidence
      );

      return filteredEntities;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to extract entities from content:`, error);
      return [];
    }
  }

  /**
   * Parse AI extraction response
   */
  private parseExtractionResponse(content: string): { entities: DriveEntity[] } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`${LOG_PREFIX} No JSON found in response`);
        return { entities: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        console.warn(`${LOG_PREFIX} Invalid response structure`);
        return { entities: [] };
      }

      // Validate and transform entities
      const validEntities = parsed.entities
        .filter((entity: any) => {
          return (
            entity.type &&
            entity.value &&
            entity.normalized &&
            typeof entity.confidence === 'number' &&
            entity.source
          );
        })
        .map((entity: any) => ({
          type: entity.type,
          value: entity.value,
          normalized: entity.normalized,
          confidence: entity.confidence,
          source: entity.source,
          context: entity.context,
          documentSection: entity.documentSection,
          isFromMetadata: entity.isFromMetadata || false,
          isFromCollaborator: entity.isFromCollaborator || false,
          relatedTo: entity.relatedTo,
        })) as DriveEntity[];

      return { entities: validEntities };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to parse extraction response:`, error);
      console.error(`${LOG_PREFIX} Response content:`, content);
      return { entities: [] };
    }
  }

  /**
   * Deduplicate entities by type and normalized name
   */
  private deduplicateEntities(entities: DriveEntity[]): DriveEntity[] {
    const seen = new Map<string, DriveEntity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalized}`;
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, entity);
      } else {
        // Keep the one with higher confidence
        if (entity.confidence > existing.confidence) {
          seen.set(key, entity);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Normalize entity name for consistent tracking
   */
  private normalizeEntityName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .trim();
  }

  /**
   * Batch extraction with progress tracking
   */
  async extractBatch(
    files: Array<{ file: DriveFile; content: string }>
  ): Promise<DriveExtractionResult[]> {
    const startTime = Date.now();
    const results: DriveExtractionResult[] = [];
    let totalCost = 0;
    let totalEntities = 0;

    console.log(`${LOG_PREFIX} Processing ${files.length} documents...`);

    for (const { file, content } of files) {
      try {
        const result = await this.extractFromDocument(file, content);
        results.push(result);
        totalCost += result.cost;
        totalEntities += result.entities.length;

        // Log progress every 10 files
        if (results.length % 10 === 0) {
          console.log(`${LOG_PREFIX} Progress: ${results.length}/${files.length}`);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to extract from ${file.name}:`, error);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(`${LOG_PREFIX} Completed ${results.length}/${files.length} extractions`);
    console.log(`${LOG_PREFIX} Total entities: ${totalEntities}`);
    console.log(`${LOG_PREFIX} Total cost: $${totalCost.toFixed(6)}`);
    console.log(`${LOG_PREFIX} Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    console.log(
      `${LOG_PREFIX} Performance: ${((files.length / processingTimeMs) * 1000).toFixed(2)} docs/second`
    );

    return results;
  }
}

/**
 * Singleton instance
 */
let extractorInstance: DriveEntityExtractor | null = null;

export function getDriveEntityExtractor(
  config?: Partial<DriveExtractionConfig>
): DriveEntityExtractor {
  if (!extractorInstance || config) {
    extractorInstance = new DriveEntityExtractor(config);
  }
  return extractorInstance;
}
