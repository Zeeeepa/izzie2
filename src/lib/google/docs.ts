/**
 * Google Docs Service
 * Handles structured document reading with proper formatting, headings, and lists
 */

import { google, Auth } from 'googleapis';
import type { docs_v1 } from 'googleapis';
import type { GoogleDocStructured, DocSection, DocParagraph, DocList } from './types';

const LOG_PREFIX = '[Docs Service]';

export class DocsService {
  private docs: docs_v1.Docs;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.docs = google.docs({ version: 'v1', auth: auth as Auth.OAuth2Client });
  }

  /**
   * Get structured document content
   */
  async getDocument(documentId: string): Promise<GoogleDocStructured> {
    try {
      console.log(`${LOG_PREFIX} Fetching document: ${documentId}`);

      const response = await this.docs.documents.get({
        documentId,
      });

      const doc = response.data;
      if (!doc.body || !doc.body.content) {
        throw new Error('Document has no content');
      }

      console.log(`${LOG_PREFIX} Retrieved document: ${doc.title}`);

      return this.parseDocument(doc);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to get document ${documentId}:`, error);
      throw new Error(`Failed to get document ${documentId}: ${error}`);
    }
  }

  /**
   * Parse Google Docs API response into structured format
   */
  private parseDocument(doc: docs_v1.Schema$Document): GoogleDocStructured {
    const sections: DocSection[] = [];
    let currentSection: DocSection | null = null;
    let currentList: DocList | null = null;

    if (!doc.body?.content) {
      return {
        documentId: doc.documentId || '',
        title: doc.title || 'Untitled Document',
        sections: [],
      };
    }

    // Process each structural element
    for (const element of doc.body.content) {
      if (!element.paragraph) {
        continue; // Skip non-paragraph elements for now
      }

      const paragraph = element.paragraph;

      // Check if this is a heading
      const style = paragraph.paragraphStyle?.namedStyleType;
      if (style && style.startsWith('HEADING_')) {
        // Save current section and list
        if (currentSection) {
          if (currentList) {
            currentSection.lists.push(currentList);
            currentList = null;
          }
          sections.push(currentSection);
        }

        // Start new section
        const headingLevel = parseInt(style.replace('HEADING_', '')) || 1;
        const headingText = this.extractText(paragraph);

        currentSection = {
          heading: headingText,
          headingLevel,
          paragraphs: [],
          lists: [],
        };
      } else if (paragraph.bullet) {
        // This is a list item
        const listId = paragraph.bullet.listId || '';
        const nestingLevel = paragraph.bullet.nestingLevel || 0;
        const text = this.extractText(paragraph);

        // Start new list or add to existing
        if (!currentList || currentList.listId !== listId) {
          if (currentList && currentSection) {
            currentSection.lists.push(currentList);
          }
          currentList = {
            listId,
            type: 'bulleted', // Default to bulleted (can be enhanced)
            items: [],
          };
        }

        currentList.items.push({
          text,
          nestingLevel,
        });
      } else {
        // Regular paragraph
        const text = this.extractText(paragraph);
        if (text.trim()) {
          // Save any open list before adding paragraph
          if (currentList && currentSection) {
            currentSection.lists.push(currentList);
            currentList = null;
          }

          const docParagraph: DocParagraph = {
            text,
            style: {
              bold: this.hasTextStyle(paragraph, 'bold'),
              italic: this.hasTextStyle(paragraph, 'italic'),
              underline: this.hasTextStyle(paragraph, 'underline'),
            },
          };

          if (currentSection) {
            currentSection.paragraphs.push(docParagraph);
          } else {
            // Create a default section for paragraphs before first heading
            if (sections.length === 0 || sections[sections.length - 1].heading !== '') {
              currentSection = {
                heading: '',
                headingLevel: 0,
                paragraphs: [docParagraph],
                lists: [],
              };
            } else {
              sections[sections.length - 1].paragraphs.push(docParagraph);
            }
          }
        }
      }
    }

    // Add final section and list if any
    if (currentList && currentSection) {
      currentSection.lists.push(currentList);
    }
    if (currentSection) {
      sections.push(currentSection);
    }

    return {
      documentId: doc.documentId || '',
      title: doc.title || 'Untitled Document',
      sections,
    };
  }

  /**
   * Extract plain text from a paragraph
   */
  private extractText(paragraph: docs_v1.Schema$Paragraph): string {
    if (!paragraph.elements) {
      return '';
    }

    return paragraph.elements
      .map((element) => {
        if (element.textRun?.content) {
          return element.textRun.content;
        }
        return '';
      })
      .join('')
      .trim();
  }

  /**
   * Check if paragraph has specific text style
   */
  private hasTextStyle(
    paragraph: docs_v1.Schema$Paragraph,
    style: 'bold' | 'italic' | 'underline'
  ): boolean {
    if (!paragraph.elements) {
      return false;
    }

    return paragraph.elements.some((element) => {
      const textStyle = element.textRun?.textStyle;
      if (!textStyle) return false;

      switch (style) {
        case 'bold':
          return textStyle.bold === true;
        case 'italic':
          return textStyle.italic === true;
        case 'underline':
          return textStyle.underline === true;
        default:
          return false;
      }
    });
  }
}

/**
 * Factory function with singleton support
 */
let docsServiceInstance: DocsService | null = null;

export async function getDocsService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<DocsService> {
  if (!docsServiceInstance || auth) {
    docsServiceInstance = new DocsService(auth);
  }
  return docsServiceInstance;
}
