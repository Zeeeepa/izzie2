/**
 * Onboarding State Service
 *
 * Manages the processing state machine: idle -> running <-> paused -> stopped/idle
 * Handles abort controller lifecycle for cancellation support.
 */

import type { ProcessingState } from '../../types';
import type { IOnboardingStateService, StateChangeCallback } from './interfaces';

const LOG_PREFIX = '[StateService]';

export class OnboardingStateService implements IOnboardingStateService {
  private state: ProcessingState = 'idle';
  private abortController: AbortController | null = null;
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();

  getState(): ProcessingState {
    return this.state;
  }

  canStart(): boolean {
    return this.state === 'idle' || this.state === 'stopped';
  }

  canPause(): boolean {
    return this.state === 'running';
  }

  canResume(): boolean {
    return this.state === 'paused';
  }

  canStop(): boolean {
    return this.state === 'running' || this.state === 'paused';
  }

  getAbortSignal(): AbortSignal | null {
    return this.abortController?.signal ?? null;
  }

  start(): AbortController {
    const previousState = this.state;
    this.state = 'running';
    this.abortController = new AbortController();

    this.notifyStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Started processing`);

    return this.abortController;
  }

  pause(): boolean {
    if (!this.canPause()) {
      console.warn(`${LOG_PREFIX} Cannot pause from state: ${this.state}`);
      return false;
    }

    const previousState = this.state;
    this.state = 'paused';
    this.notifyStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Paused processing`);
    return true;
  }

  resume(): boolean {
    if (!this.canResume()) {
      console.warn(`${LOG_PREFIX} Cannot resume from state: ${this.state}`);
      return false;
    }

    const previousState = this.state;
    this.state = 'running';
    this.notifyStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Resumed processing`);
    return true;
  }

  stop(): boolean {
    if (!this.canStop() && this.state !== 'idle') {
      console.warn(`${LOG_PREFIX} Cannot stop from state: ${this.state}`);
      return false;
    }

    const previousState = this.state;
    this.state = 'stopped';
    this.abortController?.abort();
    this.abortController = null;
    this.notifyStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Stopped processing`);
    return true;
  }

  complete(): void {
    const previousState = this.state;
    this.state = 'idle';
    this.abortController = null;
    this.notifyStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Completed processing`);
  }

  flush(): void {
    const previousState = this.state;
    this.abortController?.abort();
    this.abortController = null;
    this.state = 'idle';
    this.notifyStateChange(previousState, this.state);
    console.log(`${LOG_PREFIX} Flushed state`);
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  private notifyStateChange(
    previousState: ProcessingState,
    newState: ProcessingState
  ): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(previousState, newState);
      } catch (error) {
        console.error(`${LOG_PREFIX} State change callback error:`, error);
      }
    }
  }
}
