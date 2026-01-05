# Drive Entity Extraction

Enhanced entity extraction for Google Drive documents with document-type-aware extraction and metadata linking.

## Features

### 1. Document Type Classification

Automatically classifies documents into types:

- **Meeting Notes**: Contains attendees, agenda, action items
- **Specifications**: Technical requirements, design docs
- **Reports**: Findings, analysis, conclusions
- **Presentations**: Slide decks, pitch materials
- **Proposals**: Project plans, roadmaps, initiatives
- **Other**: Unclassified documents

**Accuracy Target**: >80% classification accuracy

**Methods**:
- Pattern-based classification (fast, free)
- AI-based classification for ambiguous cases (Mistral Small)

### 2. Enhanced Entity Extraction

Extracts entities from multiple sources:

**Entity Types**:
- **Person**: Names from metadata, collaborators, content
- **Company**: Organizations, departments, teams
- **Project**: Project names, initiatives
- **Date**: Meeting dates, deadlines, milestones
- **Topic**: Subject areas, themes
- **Location**: Cities, countries, offices

**Sources**:
- Document metadata (owners, collaborators)
- Document content (AI extraction)
- Document structure (headings, sections)

### 3. Multi-Format Support

Supports extraction from:

- Google Docs (`application/vnd.google-apps.document`)
- Google Sheets (`application/vnd.google-apps.spreadsheet`)
- Google Slides (`application/vnd.google-apps.presentation`)
- PDFs (`application/pdf`)
- Plain text (`text/plain`, `text/markdown`)

### 4. Document Structure Extraction

Extracts hierarchical document structure:

- Headings (H1-H6, markdown, ALL CAPS patterns)
- Sections (content grouped by headings)
- Tables (future: extract tabular data)
- Lists (future: extract ordered/unordered lists)

## Usage

### Basic Extraction

```typescript
import { getDriveEntityExtractor } from '@/lib/drive';

const extractor = getDriveEntityExtractor();

const result = await extractor.extractFromDocument(driveFile, content);

console.log(`Document type: ${result.classification.type}`);
console.log(`Found ${result.entities.length} entities`);
console.log(`Extraction cost: $${result.cost}`);
```

### Custom Configuration

```typescript
import { getDriveEntityExtractor } from '@/lib/drive';

const extractor = getDriveEntityExtractor({
  classifyDocument: true,
  extractStructure: true,
  extractFromMetadata: true,
  extractFromCollaborators: true,
  minConfidence: 0.8, // Higher threshold
  detectMeetingNotes: true,
  detectSpecifications: true,
  detectReports: true,
});
```

### Batch Extraction

```typescript
const files = [
  { file: driveFile1, content: content1 },
  { file: driveFile2, content: content2 },
];

const results = await extractor.extractBatch(files);

console.log(`Processed ${results.length} documents`);
```

### Document Classification Only

```typescript
import { getDocumentClassifier } from '@/lib/drive';

const classifier = getDocumentClassifier();

const classification = await classifier.classify(
  fileName,
  content,
  mimeType,
  useAI // true to use AI for ambiguous cases
);

console.log(`Type: ${classification.type}`);
console.log(`Confidence: ${classification.confidence}`);
console.log(`Indicators: ${classification.indicators.join(', ')}`);
```

### Structure Extraction Only

```typescript
import { getDocumentClassifier } from '@/lib/drive';

const classifier = getDocumentClassifier();

const structure = classifier.extractStructure(content, mimeType);

console.log(`Found ${structure.headings.length} headings`);
console.log(`Extracted ${structure.sections.length} sections`);

// Access sections
for (const section of structure.sections) {
  console.log(`Section: ${section.heading?.text}`);
  console.log(`Content: ${section.content.substring(0, 100)}...`);
}
```

## Integration

The Drive entity extractor is integrated into the ingestion pipeline:

1. **Drive Ingestion** (`ingest-drive.ts`): Fetches changed files
2. **Entity Extraction** (`extract-entities.ts`): Uses Drive-specific extractor
3. **Graph Update** (`update-graph.ts`): Stores entities in Neo4j

## Performance

**Target**: 50 documents in under 60 seconds

**Benchmarks**:
- Pattern classification: ~10ms per document
- AI classification: ~500ms per document
- Structure extraction: ~50ms per document
- Entity extraction: ~1-2s per document (depends on content length)

**Cost**:
- Pattern classification: Free
- AI classification: ~$0.0001 per document (Mistral Small)
- Entity extraction: ~$0.001 per document (Mistral Small)

## Testing

Run tests:

```bash
npm test src/lib/drive/__tests__
```

Test coverage includes:
- Document type classification (pattern and AI)
- Entity extraction from metadata
- Entity extraction from content
- Structure extraction
- Deduplication
- Configuration options
- Edge cases

## API Reference

### DriveEntityExtractor

**Methods**:

- `extractFromDocument(file, content)`: Extract entities from single document
- `extractBatch(files)`: Extract entities from multiple documents

**Returns**: `DriveExtractionResult`

### DocumentClassifier

**Methods**:

- `classify(fileName, content, mimeType, useAI)`: Classify document type
- `extractStructure(content, mimeType)`: Extract document structure

**Returns**: `DocumentClassification` or `DocumentStructure`

### Types

See `types.ts` for complete type definitions:

- `DocumentType`: Document classification types
- `DocumentClassification`: Classification result
- `DocumentStructure`: Extracted structure
- `DriveEntity`: Enhanced entity with Drive-specific metadata
- `DriveExtractionResult`: Complete extraction result
- `DriveExtractionConfig`: Configuration options

## Future Enhancements

- [ ] Table extraction from spreadsheets and documents
- [ ] List extraction (ordered/unordered)
- [ ] Image/diagram analysis from presentations
- [ ] Relationship extraction (who worked on what)
- [ ] Timeline extraction (project milestones)
- [ ] Advanced meeting notes parsing (action items with assignees)
- [ ] Specification requirement extraction
- [ ] Report metrics/data extraction

## Examples

See `__tests__/` directory for comprehensive examples of:

- Meeting notes extraction
- Specification document parsing
- Report analysis
- Structure extraction from markdown
- Metadata linking
- Batch processing
