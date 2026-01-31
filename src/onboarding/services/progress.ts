/**
 * Progress Tracking Service
 *
 * Manages processing state and emits SSE events to connected clients.
 */

import type {
  ProcessingState,
  SSEEvent,
  ProgressUpdate,
  EmailProcessedEvent,
  RelationshipEvent,
  ErrorEvent,
  CompleteEvent,
  StateChangeEvent,
  ProcessingSummary,
  DiscoveredEntity,
  DiscoveredRelationship,
} from '../types';
import type { Entity, InlineRelationship } from '@/lib/extraction/types';
import type { Response } from 'express';

const LOG_PREFIX = '[Progress]';

export class ProgressService {
  private state: ProcessingState = 'idle';
  private clients: Set<Response> = new Set();
  private abortController: AbortController | null = null;

  // Processing stats
  private emailsProcessed = 0;
  private totalEmails = 0;
  private currentDay = '';
  private currentBatch = 0;
  private totalBatches = 0;
  private startTime = 0;

  // Discovered data
  private entities: Map<string, DiscoveredEntity> = new Map();
  private relationships: Map<string, DiscoveredRelationship> = new Map();

  /**
   * Get current processing state
   */
  getState(): ProcessingState {
    return this.state;
  }

  /**
   * Check if processing can be started
   */
  canStart(): boolean {
    return this.state === 'idle' || this.state === 'stopped';
  }

  /**
   * Check if processing can be paused
   */
  canPause(): boolean {
    return this.state === 'running';
  }

  /**
   * Check if processing can be resumed
   */
  canResume(): boolean {
    return this.state === 'paused';
  }

  /**
   * Check if processing can be stopped
   */
  canStop(): boolean {
    return this.state === 'running' || this.state === 'paused';
  }

  /**
   * Get the abort signal for cancellation
   */
  getAbortSignal(): AbortSignal | null {
    return this.abortController?.signal ?? null;
  }

  /**
   * Start processing
   */
  start(): AbortController {
    const previousState = this.state;
    this.state = 'running';
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.emailsProcessed = 0;
    this.totalEmails = 0;
    this.entities.clear();
    this.relationships.clear();

    this.emitStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Started processing`);

    return this.abortController;
  }

  /**
   * Pause processing
   */
  pause(): void {
    if (!this.canPause()) {
      console.warn(`${LOG_PREFIX} Cannot pause from state: ${this.state}`);
      return;
    }

    const previousState = this.state;
    this.state = 'paused';
    this.emitStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Paused processing`);
  }

  /**
   * Resume processing
   */
  resume(): void {
    if (!this.canResume()) {
      console.warn(`${LOG_PREFIX} Cannot resume from state: ${this.state}`);
      return;
    }

    const previousState = this.state;
    this.state = 'running';
    this.emitStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Resumed processing`);
  }

  /**
   * Stop processing
   */
  stop(): void {
    if (!this.canStop() && this.state !== 'idle') {
      console.warn(`${LOG_PREFIX} Cannot stop from state: ${this.state}`);
      return;
    }

    const previousState = this.state;
    this.state = 'stopped';
    this.abortController?.abort();
    this.abortController = null;
    this.emitStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Stopped processing`);
  }

  /**
   * Complete processing
   */
  complete(): void {
    const previousState = this.state;
    this.state = 'idle';
    this.abortController = null;

    const summary = this.buildSummary();
    this.emitComplete(summary);
    this.emitStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Completed processing`);
  }

  /**
   * Flush all data and reset
   */
  flush(): void {
    this.stop();
    this.emailsProcessed = 0;
    this.totalEmails = 0;
    this.currentDay = '';
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.entities.clear();
    this.relationships.clear();
    this.state = 'idle';
    console.log(`${LOG_PREFIX} Flushed all data`);
  }

  /**
   * Set total emails count
   */
  setTotalEmails(count: number): void {
    this.totalEmails = count;
  }

  /**
   * Set current day being processed
   */
  setCurrentDay(day: string): void {
    this.currentDay = day;
    this.emitProgress();
  }

  /**
   * Set batch progress
   */
  setBatchProgress(current: number, total: number): void {
    this.currentBatch = current;
    this.totalBatches = total;
    this.emitProgress();
  }

  /**
   * Record a processed email
   */
  recordEmail(
    email: {
      id: string;
      subject: string;
      from: string;
      to: string[];
      date: Date;
      snippet?: string;
    },
    entities: Entity[],
    relationships: InlineRelationship[],
    isSpam: boolean,
    spamScore: number
  ): void {
    this.emailsProcessed++;

    // Track entities
    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalized}`;
      const existing = this.entities.get(key);

      if (existing) {
        existing.emailIds.push(email.id);
        existing.lastSeen = email.date;
        existing.occurrenceCount++;
      } else {
        this.entities.set(key, {
          ...entity,
          emailIds: [email.id],
          firstSeen: email.date,
          lastSeen: email.date,
          occurrenceCount: 1,
        });
      }
    }

    // Track relationships
    for (const rel of relationships) {
      const key = `${rel.fromType}:${rel.fromValue}|${rel.relationshipType}|${rel.toType}:${rel.toValue}`;
      const existing = this.relationships.get(key);

      if (existing) {
        existing.sourceEmailIds.push(email.id);
        existing.lastSeen = email.date;
        existing.occurrenceCount++;
      } else {
        this.relationships.set(key, {
          ...rel,
          sourceEmailIds: [email.id],
          firstSeen: email.date,
          lastSeen: email.date,
          occurrenceCount: 1,
        });
      }
    }

    // Emit email event
    this.emitEmailProcessed({
      id: email.id,
      subject: email.subject,
      from: email.from,
      to: email.to,
      date: email.date.toISOString(),
      snippet: email.snippet,
    }, entities, relationships, isSpam, spamScore);

    // Emit relationship events
    for (const rel of relationships) {
      this.emitRelationship(rel, email.id);
    }

    // Emit progress
    this.emitProgress();
  }

  /**
   * Record an error
   */
  recordError(message: string, details?: string): void {
    this.emitError(message, details);
  }

  /**
   * Add SSE client
   */
  addClient(res: Response): void {
    this.clients.add(res);
    console.log(`${LOG_PREFIX} Client connected (${this.clients.size} total)`);

    // Send current state immediately
    this.sendToClient(res, {
      type: 'state_change',
      previousState: this.state,
      newState: this.state,
    });

    // Send current progress if processing
    if (this.state !== 'idle') {
      this.sendToClient(res, this.buildProgressUpdate());
    }
  }

  /**
   * Remove SSE client
   */
  removeClient(res: Response): void {
    this.clients.delete(res);
    console.log(`${LOG_PREFIX} Client disconnected (${this.clients.size} remaining)`);
  }

  /**
   * Get discovered entities
   */
  getEntities(): DiscoveredEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get discovered relationships
   */
  getRelationships(): DiscoveredRelationship[] {
    return Array.from(this.relationships.values());
  }

  // Private methods

  private buildProgressUpdate(): ProgressUpdate {
    return {
      type: 'progress',
      state: this.state,
      currentDay: this.currentDay,
      emailsProcessed: this.emailsProcessed,
      totalEmails: this.totalEmails,
      entitiesFound: this.entities.size,
      relationshipsFound: this.relationships.size,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
    };
  }

  private buildSummary(): ProcessingSummary {
    const entities = Array.from(this.entities.values());
    const relationships = Array.from(this.relationships.values());

    // Count unique by type
    const uniquePeople = entities.filter((e) => e.type === 'person').length;
    const uniqueCompanies = entities.filter((e) => e.type === 'company').length;
    const uniqueProjects = entities.filter((e) => e.type === 'project').length;

    // Top entities by occurrence
    const topEntities = entities
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 10)
      .map((e) => ({
        type: e.type,
        value: e.value,
        count: e.occurrenceCount,
      }));

    // Top relationships by occurrence
    const topRelationships = relationships
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 10)
      .map((r) => ({
        from: r.fromValue,
        to: r.toValue,
        type: r.relationshipType,
        count: r.occurrenceCount,
      }));

    // Date range
    const allDates = entities.flatMap((e) => [e.firstSeen, e.lastSeen]);
    const startDate = allDates.length > 0
      ? new Date(Math.min(...allDates.map((d) => d.getTime())))
      : new Date();
    const endDate = allDates.length > 0
      ? new Date(Math.max(...allDates.map((d) => d.getTime())))
      : new Date();

    return {
      totalEmailsProcessed: this.emailsProcessed,
      totalEntitiesFound: entities.length,
      totalRelationshipsFound: relationships.length,
      uniquePeople,
      uniqueCompanies,
      uniqueProjects,
      processingTimeMs: Date.now() - this.startTime,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      topEntities,
      topRelationships,
    };
  }

  private emitProgress(): void {
    this.broadcast(this.buildProgressUpdate());
  }

  private emitStateChange(previousState: ProcessingState, newState: ProcessingState): void {
    this.broadcast({
      type: 'state_change',
      previousState,
      newState,
    });
  }

  private emitEmailProcessed(
    email: EmailProcessedEvent['email'],
    entities: Entity[],
    relationships: InlineRelationship[],
    isSpam: boolean,
    spamScore: number
  ): void {
    this.broadcast({
      type: 'email',
      email,
      entities,
      relationships,
      isSpam,
      spamScore,
    });
  }

  private emitRelationship(relationship: InlineRelationship, sourceEmail: string): void {
    this.broadcast({
      type: 'relationship',
      relationship,
      sourceEmail,
    });
  }

  private emitError(message: string, details?: string): void {
    this.broadcast({
      type: 'error',
      message,
      details,
    });
  }

  private emitComplete(summary: ProcessingSummary): void {
    this.broadcast({
      type: 'complete',
      summary,
    });
  }

  private broadcast(event: SSEEvent): void {
    for (const client of this.clients) {
      this.sendToClient(client, event);
    }
  }

  private sendToClient(client: Response, event: SSEEvent): void {
    try {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send to client:`, error);
      this.clients.delete(client);
    }
  }
}

// Singleton instance
let progressServiceInstance: ProgressService | null = null;

export function getProgressService(): ProgressService {
  if (!progressServiceInstance) {
    progressServiceInstance = new ProgressService();
  }
  return progressServiceInstance;
}
