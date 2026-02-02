/**
 * Gmail Filter Service
 * Handles email filter operations
 */

import type { gmail_v1 } from 'googleapis';
import type { GmailFilter, GmailFilterCriteria, GmailFilterAction } from '../types';
import type { IGmailFilterService } from './interfaces';

export class GmailFilterService implements IGmailFilterService {
  constructor(private gmail: gmail_v1.Gmail) {}

  /**
   * List all email filters
   */
  async listFilters(): Promise<GmailFilter[]> {
    try {
      const response = await this.gmail.users.settings.filters.list({
        userId: 'me',
      });

      const filters = response.data.filter || [];
      return filters.map((filter) => this.parseFilter(filter));
    } catch (error) {
      console.error('[Gmail] Failed to list filters:', error);
      throw new Error(`Failed to list filters: ${error}`);
    }
  }

  /**
   * Get a specific filter by ID
   */
  async getFilter(filterId: string): Promise<GmailFilter> {
    try {
      const response = await this.gmail.users.settings.filters.get({
        userId: 'me',
        id: filterId,
      });

      return this.parseFilter(response.data);
    } catch (error) {
      console.error(`[Gmail] Failed to get filter ${filterId}:`, error);
      throw new Error(`Failed to get filter: ${error}`);
    }
  }

  /**
   * Create an email filter
   */
  async createFilter(
    criteria: GmailFilterCriteria,
    action: GmailFilterAction
  ): Promise<GmailFilter> {
    try {
      const response = await this.gmail.users.settings.filters.create({
        userId: 'me',
        requestBody: {
          criteria: {
            from: criteria.from,
            to: criteria.to,
            subject: criteria.subject,
            query: criteria.query,
            negatedQuery: criteria.negatedQuery,
            hasAttachment: criteria.hasAttachment,
            excludeChats: criteria.excludeChats,
            size: criteria.size,
            sizeComparison: criteria.sizeComparison,
          },
          action: {
            addLabelIds: action.addLabelIds,
            removeLabelIds: action.removeLabelIds,
            forward: action.forward,
          },
        },
      });

      return this.parseFilter(response.data);
    } catch (error) {
      console.error('[Gmail] Failed to create filter:', error);
      throw new Error(`Failed to create filter: ${error}`);
    }
  }

  /**
   * Delete an email filter
   */
  async deleteFilter(filterId: string): Promise<void> {
    try {
      await this.gmail.users.settings.filters.delete({
        userId: 'me',
        id: filterId,
      });
    } catch (error) {
      console.error(`[Gmail] Failed to delete filter ${filterId}:`, error);
      throw new Error(`Failed to delete filter: ${error}`);
    }
  }

  /**
   * Parse Gmail API filter to internal type
   */
  private parseFilter(filter: gmail_v1.Schema$Filter): GmailFilter {
    return {
      id: filter.id || '',
      criteria: {
        from: filter.criteria?.from || undefined,
        to: filter.criteria?.to || undefined,
        subject: filter.criteria?.subject || undefined,
        query: filter.criteria?.query || undefined,
        negatedQuery: filter.criteria?.negatedQuery || undefined,
        hasAttachment: filter.criteria?.hasAttachment || undefined,
        excludeChats: filter.criteria?.excludeChats || undefined,
        size: filter.criteria?.size || undefined,
        sizeComparison: filter.criteria?.sizeComparison as 'larger' | 'smaller' | undefined,
      },
      action: {
        addLabelIds: filter.action?.addLabelIds || undefined,
        removeLabelIds: filter.action?.removeLabelIds || undefined,
        forward: filter.action?.forward || undefined,
      },
    };
  }
}
