/**
 * API Routes
 *
 * Handles processing control (start/pause/stop/flush) and SSE streaming.
 */

import { Router, Request, Response } from 'express';
import { getProgressService } from '../services/progress';
import { createEmailProcessor, EmailProcessorService } from '../services/email-processor';
import { getAuthenticatedClient, isAuthenticated } from './oauth';
import type { ProcessingConfig } from '../types';

const LOG_PREFIX = '[API]';

const router = Router();

// Current processor instance
let processor: EmailProcessorService | null = null;

/**
 * Middleware to require authentication
 */
function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated. Please login first.' });
    return;
  }
  next();
}

/**
 * GET /api/events
 * SSE endpoint for real-time progress updates
 */
router.get('/events', (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} SSE client connected`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Add client to progress service
  const progress = getProgressService();
  progress.addClient(res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`${LOG_PREFIX} SSE client disconnected`);
    clearInterval(pingInterval);
    progress.removeClient(res);
  });
});

/**
 * POST /api/start
 * Start processing emails
 */
router.post('/start', requireAuth, async (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Start processing requested`);

  const progress = getProgressService();

  if (!progress.canStart()) {
    res.status(400).json({
      error: 'Cannot start processing',
      currentState: progress.getState(),
    });
    return;
  }

  const client = getAuthenticatedClient();
  if (!client) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Get optional config from body
  const config: Partial<ProcessingConfig> = {
    batchSize: req.body.batchSize,
    delayBetweenBatches: req.body.delayBetweenBatches,
    maxEmailsPerDay: req.body.maxEmailsPerDay,
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
  };

  // Create processor
  processor = createEmailProcessor(client, config);

  // Set user identity if provided
  if (req.body.userEmail) {
    processor.setUserIdentity(req.body.userEmail, req.body.userName);
  }

  // Start processing
  const abortController = progress.start();

  // Run processing in background
  processor.processSentEmails(abortController.signal).catch((error) => {
    console.error(`${LOG_PREFIX} Processing error:`, error);
    progress.recordError(
      'Processing failed',
      error instanceof Error ? error.message : String(error)
    );
    progress.stop();
  });

  res.json({
    success: true,
    message: 'Processing started',
    state: progress.getState(),
  });
});

/**
 * POST /api/pause
 * Pause processing
 */
router.post('/pause', requireAuth, (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Pause requested`);

  const progress = getProgressService();

  if (!progress.canPause()) {
    res.status(400).json({
      error: 'Cannot pause processing',
      currentState: progress.getState(),
    });
    return;
  }

  progress.pause();

  res.json({
    success: true,
    message: 'Processing paused',
    state: progress.getState(),
  });
});

/**
 * POST /api/resume
 * Resume processing
 */
router.post('/resume', requireAuth, (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Resume requested`);

  const progress = getProgressService();

  if (!progress.canResume()) {
    res.status(400).json({
      error: 'Cannot resume processing',
      currentState: progress.getState(),
    });
    return;
  }

  progress.resume();

  res.json({
    success: true,
    message: 'Processing resumed',
    state: progress.getState(),
  });
});

/**
 * POST /api/stop
 * Stop processing
 */
router.post('/stop', requireAuth, (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Stop requested`);

  const progress = getProgressService();

  if (!progress.canStop()) {
    res.status(400).json({
      error: 'Cannot stop processing',
      currentState: progress.getState(),
    });
    return;
  }

  progress.stop();
  processor = null;

  res.json({
    success: true,
    message: 'Processing stopped',
    state: progress.getState(),
  });
});

/**
 * POST /api/flush
 * Flush all data and reset
 */
router.post('/flush', (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Flush requested`);

  const progress = getProgressService();
  progress.flush();
  processor = null;

  res.json({
    success: true,
    message: 'All data flushed',
    state: progress.getState(),
  });
});

/**
 * GET /api/status
 * Get current processing status
 */
router.get('/status', (_req: Request, res: Response) => {
  const progress = getProgressService();

  res.json({
    state: progress.getState(),
    authenticated: isAuthenticated(),
    entities: progress.getEntities().length,
    relationships: progress.getRelationships().length,
  });
});

/**
 * GET /api/entities
 * Get all discovered entities
 */
router.get('/entities', (_req: Request, res: Response) => {
  const progress = getProgressService();
  const entities = progress.getEntities();

  // Sort by occurrence count (descending)
  entities.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  res.json({
    count: entities.length,
    entities,
  });
});

/**
 * GET /api/relationships
 * Get all discovered relationships
 */
router.get('/relationships', (_req: Request, res: Response) => {
  const progress = getProgressService();
  const relationships = progress.getRelationships();

  // Sort by occurrence count (descending)
  relationships.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  res.json({
    count: relationships.length,
    relationships,
  });
});

export default router;
