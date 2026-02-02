/**
 * Onboarding SSE Service
 *
 * Manages Server-Sent Events (SSE) client connections and broadcasts events.
 * Handles client connection/disconnection and error resilience.
 */

import type { Response } from 'express';
import type { SSEEvent } from '../../types';
import type { IOnboardingSSEService } from './interfaces';

const LOG_PREFIX = '[SSEService]';

export class OnboardingSSEService implements IOnboardingSSEService {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    this.clients.add(res);
    console.log(`${LOG_PREFIX} Client connected (${this.clients.size} total)`);
  }

  removeClient(res: Response): void {
    this.clients.delete(res);
    console.log(`${LOG_PREFIX} Client disconnected (${this.clients.size} remaining)`);
  }

  broadcast(event: SSEEvent): void {
    const deadClients: Response[] = [];

    for (const client of this.clients) {
      try {
        client.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to send to client:`, error);
        deadClients.push(client);
      }
    }

    // Clean up dead clients
    for (const client of deadClients) {
      this.clients.delete(client);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Send event to a specific client
   */
  sendToClient(client: Response, event: SSEEvent): boolean {
    try {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send to client:`, error);
      this.clients.delete(client);
      return false;
    }
  }
}
