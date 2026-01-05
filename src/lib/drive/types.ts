/**
 * Drive-Specific Entity Extraction Types
 *
 * Type definitions for document classification and enhanced entity extraction
 * from Google Drive documents.
 */

import type { DriveFile } from '@/lib/google/types';
import type { Entity } from '@/lib/extraction/types';

/**
 * Document types that can be classified
 */
export type DocumentType =
  | 'meeting_notes'
  | 'specification'
  | 'report'
  | 'presentation'
  | 'proposal'
  | 'other';

/**
 * Document classification result
 */
export interface DocumentClassification {
  type: DocumentType;
  confidence: number;
  indicators: string[]; // Evidence for classification
}

/**
 * Document structure element
 */
export interface DocumentStructure {
  headings: Heading[];
  sections: Section[];
  tables?: Table[];
  lists?: List[];
}

/**
 * Heading in document
 */
export interface Heading {
  level: number; // 1-6 for H1-H6
  text: string;
  position: number; // Character position in document
}

/**
 * Section in document
 */
export interface Section {
  heading?: Heading;
  content: string;
  startPosition: number;
  endPosition: number;
}

/**
 * Table structure
 */
export interface Table {
  headers: string[];
  rows: string[][];
  position: number;
}

/**
 * List structure
 */
export interface List {
  type: 'ordered' | 'unordered';
  items: string[];
  position: number;
}

/**
 * Enhanced entity with Drive-specific metadata
 */
export interface DriveEntity extends Entity {
  // Additional Drive-specific fields
  documentSection?: string; // Which section entity was found in
  relatedTo?: string[]; // Related entity IDs
  isFromMetadata?: boolean; // Found in file metadata
  isFromCollaborator?: boolean; // Found in collaborators list
}

/**
 * Drive document extraction result
 */
export interface DriveExtractionResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  classification: DocumentClassification;
  structure: DocumentStructure;
  entities: DriveEntity[];
  extractedAt: Date;
  cost: number;
  model: string;
}

/**
 * Meeting notes specific extraction
 */
export interface MeetingNotesExtraction {
  date?: Date;
  attendees: string[];
  agenda?: string[];
  actionItems: ActionItem[];
  decisions: string[];
}

/**
 * Action item from meeting notes
 */
export interface ActionItem {
  task: string;
  assignee?: string;
  dueDate?: Date;
  status?: 'pending' | 'in_progress' | 'completed';
}

/**
 * Specification document extraction
 */
export interface SpecificationExtraction {
  requirements: Requirement[];
  technicalDetails: TechnicalDetail[];
  dependencies: string[];
}

/**
 * Requirement from specification
 */
export interface Requirement {
  id?: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status?: 'proposed' | 'approved' | 'implemented' | 'rejected';
}

/**
 * Technical detail from specification
 */
export interface TechnicalDetail {
  category: string;
  description: string;
  relatedEntities: string[];
}

/**
 * Report document extraction
 */
export interface ReportExtraction {
  summary?: string;
  findings: Finding[];
  conclusions: string[];
  recommendations: string[];
}

/**
 * Finding from report
 */
export interface Finding {
  description: string;
  data?: string; // Associated data/metrics
  significance: 'low' | 'medium' | 'high';
}

/**
 * Configuration for Drive entity extraction
 */
export interface DriveExtractionConfig {
  classifyDocument: boolean; // Classify document type
  extractStructure: boolean; // Extract document structure
  extractFromMetadata: boolean; // Extract from file metadata
  extractFromCollaborators: boolean; // Extract from collaborators
  minConfidence: number; // Minimum confidence threshold
  detectMeetingNotes: boolean; // Detect meeting-specific content
  detectSpecifications: boolean; // Detect spec-specific content
  detectReports: boolean; // Detect report-specific content
}

export const DEFAULT_DRIVE_EXTRACTION_CONFIG: DriveExtractionConfig = {
  classifyDocument: true,
  extractStructure: true,
  extractFromMetadata: true,
  extractFromCollaborators: true,
  minConfidence: 0.7,
  detectMeetingNotes: true,
  detectSpecifications: true,
  detectReports: true,
};

/**
 * MIME type categories
 */
export const MIME_TYPE_CATEGORIES = {
  DOCUMENT: [
    'application/vnd.google-apps.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
  ],
  SPREADSHEET: [
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ],
  PRESENTATION: [
    'application/vnd.google-apps.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ],
  PDF: ['application/pdf'],
  TEXT: ['text/plain', 'text/markdown', 'text/html'],
} as const;

/**
 * Check if MIME type is a document
 */
export function isDocumentMimeType(mimeType: string): boolean {
  return (MIME_TYPE_CATEGORIES.DOCUMENT as readonly string[]).includes(mimeType);
}

/**
 * Check if MIME type is a spreadsheet
 */
export function isSpreadsheetMimeType(mimeType: string): boolean {
  return (MIME_TYPE_CATEGORIES.SPREADSHEET as readonly string[]).includes(mimeType);
}

/**
 * Check if MIME type is a presentation
 */
export function isPresentationMimeType(mimeType: string): boolean {
  return (MIME_TYPE_CATEGORIES.PRESENTATION as readonly string[]).includes(mimeType);
}

/**
 * Get MIME type category
 */
export function getMimeTypeCategory(
  mimeType: string
): 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'text' | 'other' {
  if (isDocumentMimeType(mimeType)) return 'document';
  if (isSpreadsheetMimeType(mimeType)) return 'spreadsheet';
  if (isPresentationMimeType(mimeType)) return 'presentation';
  if ((MIME_TYPE_CATEGORIES.PDF as readonly string[]).includes(mimeType)) return 'pdf';
  if ((MIME_TYPE_CATEGORIES.TEXT as readonly string[]).includes(mimeType)) return 'text';
  return 'other';
}
