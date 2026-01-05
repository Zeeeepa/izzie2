/**
 * Document Classifier Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentClassifier } from '@/lib/drive/document-classifier';

describe('DocumentClassifier', () => {
  let classifier: DocumentClassifier;

  beforeEach(() => {
    classifier = new DocumentClassifier();
  });

  describe('Pattern-based Classification', () => {
    it('should classify meeting notes by title', async () => {
      const result = await classifier.classify(
        'Team Meeting Notes - 2025-01-15',
        'Attendees:\n- John Doe\n- Jane Smith\n\nAgenda:\n- Project updates',
        'text/plain',
        false // Don't use AI
      );

      expect(result.type).toBe('meeting_notes');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.indicators.length).toBeGreaterThan(0);
    });

    it('should classify specification by keywords', async () => {
      const result = await classifier.classify(
        'API Specification',
        'Requirements:\n- User authentication\n- API endpoints\n\nTechnical Details:\n- OAuth 2.0',
        'text/plain',
        false
      );

      expect(result.type).toBe('specification');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify report by structure', async () => {
      const result = await classifier.classify(
        'Q4 2024 Report',
        'Executive Summary:\nRevenue increased 15%\n\nFindings:\n- Marketing effective',
        'text/plain',
        false
      );

      expect(result.type).toBe('report');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify presentation by title', async () => {
      const result = await classifier.classify(
        'Product Launch Deck',
        'Slide 1: Overview\nSlide 2: Features\nSlide 3: Timeline',
        'text/plain',
        false
      );

      expect(result.type).toBe('presentation');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return other for unclear documents', async () => {
      const result = await classifier.classify(
        'Random Notes',
        'Just some random thoughts and ideas.',
        'text/plain',
        false
      );

      expect(result.type).toBe('other');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Structure Extraction', () => {
    it('should extract markdown headings', () => {
      const content = `# Main Heading
## Subheading 1
Some content here
## Subheading 2
More content`;

      const structure = classifier.extractStructure(content, 'text/markdown');

      expect(structure.headings).toHaveLength(3);
      expect(structure.headings[0].level).toBe(1);
      expect(structure.headings[0].text).toBe('Main Heading');
      expect(structure.headings[1].level).toBe(2);
      expect(structure.headings[1].text).toBe('Subheading 1');
    });

    it('should extract sections based on headings', () => {
      const content = `# Introduction
This is the introduction.

# Body
This is the main content.

# Conclusion
This is the conclusion.`;

      const structure = classifier.extractStructure(content, 'text/markdown');

      expect(structure.sections).toHaveLength(3);
      expect(structure.sections[0].heading?.text).toBe('Introduction');
      expect(structure.sections[0].content).toContain('introduction');
      expect(structure.sections[1].heading?.text).toBe('Body');
      expect(structure.sections[2].heading?.text).toBe('Conclusion');
    });

    it('should extract ALL CAPS headings', () => {
      const content = `EXECUTIVE SUMMARY
This is important.

FINDINGS
Key findings here.`;

      const structure = classifier.extractStructure(content, 'text/plain');

      expect(structure.headings.length).toBeGreaterThan(0);
      expect(structure.headings[0].text).toBe('EXECUTIVE SUMMARY');
    });

    it('should extract common heading patterns', () => {
      const content = `Agenda:
- Item 1
- Item 2

Attendees:
- John Doe
- Jane Smith

Action Items:
- Task 1
- Task 2`;

      const structure = classifier.extractStructure(content, 'text/plain');

      expect(structure.headings.length).toBeGreaterThanOrEqual(3);
      const headingTexts = structure.headings.map((h) => h.text.toLowerCase());
      expect(headingTexts).toContain('agenda:');
      expect(headingTexts).toContain('attendees:');
      expect(headingTexts).toContain('action items:');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const result = await classifier.classify('Empty File', '', 'text/plain', false);

      expect(result.type).toBe('other');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle very long content', async () => {
      const longContent = 'Meeting notes\n'.repeat(1000);

      const result = await classifier.classify('Meeting Notes', longContent, 'text/plain', false);

      expect(result.type).toBe('meeting_notes');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle content with no headings', () => {
      const content = 'Just a plain paragraph of text with no structure.';

      const structure = classifier.extractStructure(content, 'text/plain');

      expect(structure.headings).toHaveLength(0);
      expect(structure.sections).toHaveLength(1);
      expect(structure.sections[0].content).toBe(content);
    });
  });
});
