/**
 * Progress Service Interfaces
 *
 * Defines contracts for the decomposed progress tracking services.
 */

import type { Response } from 'express';
import type {
  ProcessingState,
  SSEEvent,
  ProgressUpdate,
  ProcessingSummary,
  DiscoveredEntity,
  DiscoveredRelationship,
} from '../../types';
import type { Entity, InlineRelationship } from '@/lib/extraction/types';

/**
 * State machine service for processing lifecycle
 */
export interface IOnboardingStateService {
  /** Get current processing state */
  getState(): ProcessingState;

  /** Check if processing can be started */
  canStart(): boolean;

  /** Check if processing can be paused */
  canPause(): boolean;

  /** Check if processing can be resumed */
  canResume(): boolean;

  /** Check if processing can be stopped */
  canStop(): boolean;

  /** Get the abort signal for cancellation */
  getAbortSignal(): AbortSignal | null;

  /** Start processing, returns abort controller */
  start(): AbortController;

  /** Pause processing */
  pause(): boolean;

  /** Resume processing */
  resume(): boolean;

  /** Stop processing */
  stop(): boolean;

  /** Complete processing */
  complete(): void;

  /** Flush all data and reset to idle */
  flush(): void;

  /** Subscribe to state changes */
  onStateChange(callback: StateChangeCallback): () => void;
}

export type StateChangeCallback = (
  previousState: ProcessingState,
  newState: ProcessingState
) => void;

/**
 * Email metadata for recording
 */
export interface EmailMetadata {
  id: string;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  snippet?: string;
}

/**
 * Data tracking service for entities and relationships
 */
export interface IOnboardingDataService {
  /** Set total emails count */
  setTotalEmails(count: number): void;

  /** Set current day being processed */
  setCurrentDay(day: string): void;

  /** Set batch progress */
  setBatchProgress(current: number, total: number): void;

  /** Record a processed email with entities and relationships */
  recordEmail(
    email: EmailMetadata,
    entities: Entity[],
    relationships: InlineRelationship[],
    isSpam: boolean,
    spamScore: number
  ): void;

  /** Get all discovered entities */
  getEntities(): DiscoveredEntity[];

  /** Get all discovered relationships */
  getRelationships(): DiscoveredRelationship[];

  /** Build progress update object */
  buildProgressUpdate(state: ProcessingState): ProgressUpdate;

  /** Build summary object */
  buildSummary(): ProcessingSummary;

  /** Reset all data */
  reset(): void;

  /** Get current stats */
  getStats(): DataStats;

  /** Subscribe to data changes */
  onDataChange(callback: DataChangeCallback): () => void;
}

export interface DataStats {
  emailsProcessed: number;
  totalEmails: number;
  currentDay: string;
  currentBatch: number;
  totalBatches: number;
  entitiesFound: number;
  relationshipsFound: number;
  startTime: number;
}

export type DataChangeCallback = (stats: DataStats) => void;

/**
 * SSE event emission service
 */
export interface IOnboardingSSEService {
  /** Add SSE client */
  addClient(res: Response): void;

  /** Remove SSE client */
  removeClient(res: Response): void;

  /** Broadcast event to all clients */
  broadcast(event: SSEEvent): void;

  /** Get number of connected clients */
  getClientCount(): number;
}
