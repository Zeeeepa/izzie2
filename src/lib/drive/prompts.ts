/**
 * Drive Entity Extraction Prompts
 *
 * Specialized prompts for extracting entities from Drive documents
 * based on document type and structure.
 */

import type { DocumentType, DocumentStructure, DriveExtractionConfig } from './types';
import type { DriveFile } from '@/lib/google/types';

/**
 * Build extraction prompt for Drive documents
 */
export function buildDriveExtractionPrompt(
  file: DriveFile,
  content: string,
  documentType: DocumentType,
  structure: DocumentStructure,
  config: DriveExtractionConfig
): string {
  const sections: string[] = [];

  // Add file metadata
  sections.push(`**File Name:** ${file.name}`);
  sections.push(`**Document Type:** ${documentType}`);
  sections.push(`**MIME Type:** ${file.mimeType}`);

  if (config.extractFromMetadata) {
    sections.push(`**Owner:** ${file.owners[0]?.displayName} (${file.owners[0]?.emailAddress})`);

    if (file.permissions && file.permissions.length > 0) {
      const collaborators = file.permissions
        .filter((p) => p.type === 'user' && p.emailAddress !== file.owners[0]?.emailAddress)
        .slice(0, 10); // Limit to 10 collaborators

      if (collaborators.length > 0) {
        sections.push(
          `**Collaborators:** ${collaborators.map((c) => c.displayName || c.emailAddress).join(', ')}`
        );
      }
    }
  }

  // Add document structure
  if (config.extractStructure && structure.headings.length > 0) {
    sections.push(`**Document Structure:**`);
    structure.headings.slice(0, 10).forEach((heading) => {
      sections.push(`${'  '.repeat(heading.level - 1)}- ${heading.text}`);
    });
  }

  // Add content
  sections.push(`**Content:**\n${content}`);

  // Build prompt based on document type
  const basePrompt = buildBaseEntityPrompt(config);
  const typeSpecificPrompt = buildTypeSpecificPrompt(documentType);

  return `${sections.join('\n')}

${basePrompt}

${typeSpecificPrompt}

**Instructions:**
- Extract entities with confidence scores (0.0 to 1.0)
- Link entities to document sections using heading text
- Extract people from collaborators and owners
- Normalize entity names consistently
- Minimum confidence threshold: ${config.minConfidence}
- Include context from surrounding text

**Response Format (JSON only):**
{
  "entities": [
    {
      "type": "person",
      "value": "John Doe",
      "normalized": "john_doe",
      "confidence": 0.95,
      "source": "metadata",
      "context": "Document owner",
      "documentSection": "metadata",
      "isFromMetadata": true
    },
    {
      "type": "company",
      "value": "Acme Corp",
      "normalized": "acme_corp",
      "confidence": 0.9,
      "source": "body",
      "context": "partnership with Acme Corp",
      "documentSection": "Introduction"
    },
    {
      "type": "project",
      "value": "Project Phoenix",
      "normalized": "project_phoenix",
      "confidence": 0.95,
      "source": "body",
      "context": "Project Phoenix timeline",
      "documentSection": "Requirements"
    }
  ]
}

Respond with JSON only. No additional text.`;
}

/**
 * Base entity extraction prompt
 */
function buildBaseEntityPrompt(config: DriveExtractionConfig): string {
  return `**Entity Types to Extract:**
1. **person** - People's names (from metadata, collaborators, and content)
   - Extract from owners, collaborators, and document content
   - Link email addresses when available

2. **company** - Organizations and companies
   - Company names, departments, teams

3. **project** - Project names and initiatives
   - Project codes, initiative names

4. **date** - Important dates and deadlines
   - Meeting dates, deadlines, milestones
   - Normalize to ISO format (YYYY-MM-DD)

5. **topic** - Subject areas and themes
   - Technical topics, business areas

6. **location** - Geographic locations
   - Cities, countries, offices, venues`;
}

/**
 * Build type-specific extraction instructions
 */
function buildTypeSpecificPrompt(documentType: DocumentType): string {
  switch (documentType) {
    case 'meeting_notes':
      return `**Meeting Notes Specific:**
- Extract attendees as person entities
- Extract meeting date as date entity
- Extract action items with assignees
- Extract decisions made
- Link people to their action items`;

    case 'specification':
      return `**Specification Specific:**
- Extract requirements as topics
- Extract technical components as topics
- Extract dependencies as projects/companies
- Link requirements to responsible people
- Extract API names and system components`;

    case 'report':
      return `**Report Specific:**
- Extract key findings as topics
- Extract metrics and data points
- Extract conclusions and recommendations
- Link data to relevant people/projects
- Extract time periods for analysis`;

    case 'presentation':
      return `**Presentation Specific:**
- Extract slide titles as topics
- Extract key points and themes
- Extract mentioned projects/initiatives
- Link presenters as people entities`;

    case 'proposal':
      return `**Proposal Specific:**
- Extract proposed initiatives as projects
- Extract stakeholders as person entities
- Extract timelines as date entities
- Extract budget items and resources
- Link owners to initiatives`;

    default:
      return `**General Document:**
- Extract all relevant entities
- Focus on key people, projects, and dates
- Link related entities together`;
  }
}

/**
 * Build prompt for meeting notes extraction
 */
export function buildMeetingNotesPrompt(
  file: DriveFile,
  content: string,
  structure: DocumentStructure
): string {
  return `Extract structured information from this meeting notes document.

**File Name:** ${file.name}
**Content:**
${content}

Extract the following in JSON format:
{
  "date": "2025-01-15",
  "attendees": ["John Doe", "Jane Smith"],
  "agenda": ["Project updates", "Q1 planning"],
  "actionItems": [
    {
      "task": "Update documentation",
      "assignee": "John Doe",
      "dueDate": "2025-01-20",
      "status": "pending"
    }
  ],
  "decisions": ["Approved Q1 budget", "Postponed feature X"]
}

Respond with JSON only.`;
}

/**
 * Build prompt for specification extraction
 */
export function buildSpecificationPrompt(
  file: DriveFile,
  content: string,
  structure: DocumentStructure
): string {
  return `Extract structured information from this specification document.

**File Name:** ${file.name}
**Content:**
${content}

Extract the following in JSON format:
{
  "requirements": [
    {
      "id": "REQ-001",
      "description": "User authentication via OAuth",
      "priority": "high",
      "status": "approved"
    }
  ],
  "technicalDetails": [
    {
      "category": "Authentication",
      "description": "OAuth 2.0 implementation",
      "relatedEntities": ["User Service", "Auth API"]
    }
  ],
  "dependencies": ["Auth Service", "User Database"]
}

Respond with JSON only.`;
}

/**
 * Build prompt for report extraction
 */
export function buildReportPrompt(
  file: DriveFile,
  content: string,
  structure: DocumentStructure
): string {
  return `Extract structured information from this report document.

**File Name:** ${file.name}
**Content:**
${content}

Extract the following in JSON format:
{
  "summary": "Q4 2024 performance analysis",
  "findings": [
    {
      "description": "Revenue increased 15%",
      "data": "15% growth YoY",
      "significance": "high"
    }
  ],
  "conclusions": ["Strong quarter overall", "Marketing effective"],
  "recommendations": ["Increase marketing budget", "Expand to new markets"]
}

Respond with JSON only.`;
}
