/**
 * Drive Entity Extractor Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DriveEntityExtractor } from '@/lib/drive/entity-extractor';
import type { DriveFile } from '@/lib/google/types';

// Mock the AI client
vi.mock('@/lib/ai/client', () => ({
  getAIClient: () => ({
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        entities: [
          {
            type: 'person',
            value: 'John Doe',
            normalized: 'john_doe',
            confidence: 0.95,
            source: 'body',
            context: 'Meeting with John Doe',
          },
          {
            type: 'project',
            value: 'Project Phoenix',
            normalized: 'project_phoenix',
            confidence: 0.9,
            source: 'body',
            context: 'Project Phoenix timeline',
          },
        ],
      }),
      usage: { cost: 0.001 },
      model: 'mistral-small',
    }),
  }),
}));

describe('DriveEntityExtractor', () => {
  let extractor: DriveEntityExtractor;
  let mockFile: DriveFile;

  beforeEach(() => {
    extractor = new DriveEntityExtractor();

    mockFile = {
      id: 'file-123',
      name: 'Meeting Notes - 2025-01-15',
      mimeType: 'text/plain',
      createdTime: new Date('2025-01-15'),
      modifiedTime: new Date('2025-01-15'),
      owners: [
        {
          displayName: 'Alice Owner',
          emailAddress: 'alice@example.com',
        },
      ],
      permissions: [
        {
          id: 'perm-1',
          type: 'user',
          role: 'writer',
          displayName: 'Bob Collaborator',
          emailAddress: 'bob@example.com',
          deleted: false,
        },
      ],
    };
  });

  describe('Metadata Extraction', () => {
    it('should extract owner from metadata', async () => {
      const content = 'Meeting notes content';

      const result = await extractor.extractFromDocument(mockFile, content);

      const ownerEntity = result.entities.find(
        (e) => e.type === 'person' && e.normalized === 'alice_owner'
      );

      expect(ownerEntity).toBeDefined();
      expect(ownerEntity?.isFromMetadata).toBe(true);
      expect(ownerEntity?.confidence).toBe(1.0);
    });

    it('should extract collaborators from permissions', async () => {
      const content = 'Meeting notes content';

      const result = await extractor.extractFromDocument(mockFile, content);

      const collaboratorEntity = result.entities.find(
        (e) => e.type === 'person' && e.normalized === 'bob_collaborator'
      );

      expect(collaboratorEntity).toBeDefined();
      expect(collaboratorEntity?.isFromCollaborator).toBe(true);
      expect(collaboratorEntity?.confidence).toBe(0.95);
    });

    it('should not duplicate owner as collaborator', async () => {
      const fileWithOwnerAsCollaborator: DriveFile = {
        ...mockFile,
        permissions: [
          {
            id: 'perm-1',
            type: 'user',
            role: 'owner',
            displayName: 'Alice Owner',
            emailAddress: 'alice@example.com',
            deleted: false,
          },
        ],
      };

      const result = await extractor.extractFromDocument(fileWithOwnerAsCollaborator, 'Content');

      const aliceEntities = result.entities.filter((e) => e.normalized === 'alice_owner');

      expect(aliceEntities).toHaveLength(1); // Only one entity for Alice
    });
  });

  describe('Content Extraction', () => {
    it('should extract entities from content', async () => {
      const content = 'Meeting with John Doe about Project Phoenix';

      const result = await extractor.extractFromDocument(mockFile, content);

      expect(result.entities.length).toBeGreaterThan(0);

      // Check for entities from mocked AI response
      const personEntity = result.entities.find((e) => e.type === 'person' && e.value === 'John Doe');
      const projectEntity = result.entities.find(
        (e) => e.type === 'project' && e.value === 'Project Phoenix'
      );

      expect(personEntity).toBeDefined();
      expect(projectEntity).toBeDefined();
    });

    it('should include document classification', async () => {
      const content = 'Meeting notes with attendees and agenda';

      const result = await extractor.extractFromDocument(mockFile, content);

      expect(result.classification).toBeDefined();
      expect(result.classification.type).toBeDefined();
      expect(result.classification.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should extract document structure', async () => {
      const content = `# Meeting Notes

## Attendees
- Alice
- Bob

## Action Items
- Task 1`;

      const result = await extractor.extractFromDocument(mockFile, content);

      expect(result.structure).toBeDefined();
      expect(result.structure.headings.length).toBeGreaterThan(0);
      expect(result.structure.sections.length).toBeGreaterThan(0);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate entities with same type and normalized name', async () => {
      const content = 'Meeting notes';

      // Mock extractor that returns duplicate entities
      const extractorWithDuplicates = new DriveEntityExtractor();

      const result = await extractorWithDuplicates.extractFromDocument(mockFile, content);

      // Check no duplicates exist
      const entityKeys = new Set<string>();
      for (const entity of result.entities) {
        const key = `${entity.type}:${entity.normalized}`;
        expect(entityKeys.has(key)).toBe(false);
        entityKeys.add(key);
      }
    });
  });

  describe('Configuration', () => {
    it('should respect minConfidence threshold', async () => {
      const strictExtractor = new DriveEntityExtractor({
        minConfidence: 0.95,
      });

      const content = 'Meeting content';

      const result = await strictExtractor.extractFromDocument(mockFile, content);

      // All entities should have confidence >= 0.95
      for (const entity of result.entities) {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should skip classification when disabled', async () => {
      const noClassifyExtractor = new DriveEntityExtractor({
        classifyDocument: false,
      });

      const content = 'Meeting notes';

      const result = await noClassifyExtractor.extractFromDocument(mockFile, content);

      expect(result.classification.type).toBe('other');
      expect(result.classification.confidence).toBe(0);
    });

    it('should skip structure extraction when disabled', async () => {
      const noStructureExtractor = new DriveEntityExtractor({
        extractStructure: false,
      });

      const content = '# Heading\nContent';

      const result = await noStructureExtractor.extractFromDocument(mockFile, content);

      expect(result.structure.headings).toHaveLength(0);
      expect(result.structure.sections).toHaveLength(0);
    });

    it('should skip metadata extraction when disabled', async () => {
      const noMetadataExtractor = new DriveEntityExtractor({
        extractFromMetadata: false,
      });

      const content = 'Meeting notes';

      const result = await noMetadataExtractor.extractFromDocument(mockFile, content);

      // Should not have metadata entities
      const metadataEntities = result.entities.filter((e) => e.isFromMetadata);
      expect(metadataEntities).toHaveLength(0);
    });
  });

  describe('Batch Extraction', () => {
    it('should process multiple files', async () => {
      const files = [
        { file: mockFile, content: 'File 1 content' },
        {
          file: { ...mockFile, id: 'file-456', name: 'File 2' },
          content: 'File 2 content',
        },
      ];

      const results = await extractor.extractBatch(files);

      expect(results).toHaveLength(2);
      expect(results[0].fileId).toBe('file-123');
      expect(results[1].fileId).toBe('file-456');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const result = await extractor.extractFromDocument(mockFile, '');

      expect(result.entities).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should handle file without permissions', async () => {
      const fileWithoutPermissions: DriveFile = {
        ...mockFile,
        permissions: undefined,
      };

      const result = await extractor.extractFromDocument(fileWithoutPermissions, 'Content');

      expect(result.entities).toBeDefined();
      // Should still have owner entity
      const ownerEntity = result.entities.find((e) => e.isFromMetadata);
      expect(ownerEntity).toBeDefined();
    });

    it('should handle very long content', async () => {
      const longContent = 'Word '.repeat(10000); // 10k words

      const result = await extractor.extractFromDocument(mockFile, longContent);

      expect(result.entities).toBeDefined();
      expect(result.cost).toBeGreaterThan(0);
    });
  });
});
