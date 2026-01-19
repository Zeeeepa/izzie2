/**
 * Next.js Instrumentation
 * Runs once when the server starts
 * Used for initialization tasks like resetting stale extractions
 *
 * To enable this file, add to next.config.js:
 * experimental: { instrumentationHook: true }
 */

import { resetStaleExtractions } from '@/lib/extraction/progress';

export async function register() {
  // Only run on server-side (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Server startup - checking for stale extractions');

    try {
      const resetCount = await resetStaleExtractions();
      if (resetCount > 0) {
        console.log(`[Instrumentation] Reset ${resetCount} stale extraction(s) on startup`);
      }
    } catch (error) {
      console.error('[Instrumentation] Failed to reset stale extractions:', error);
    }
  }
}
