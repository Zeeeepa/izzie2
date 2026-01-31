/**
 * Onboarding Test Harness Server
 *
 * Express server for testing email classification and relationship discovery.
 * Runs on localhost:4000 with OAuth support and SSE for real-time updates.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import oauthRoutes from './routes/oauth';
import apiRoutes from './routes/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.ONBOARDING_PORT || 3333;

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Static files (UI)
app.use(express.static(path.join(__dirname, 'ui')));

// Routes
app.use('/oauth', oauthRoutes);
app.use('/api', apiRoutes);

// Root route serves UI
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Onboarding Test Harness');
  console.log('='.repeat(60));
  console.log('');
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /              - Web UI');
  console.log('    GET  /health        - Health check');
  console.log('    GET  /oauth/login   - Start OAuth flow');
  console.log('    GET  /oauth/status  - Check auth status');
  console.log('    GET  /api/events    - SSE stream');
  console.log('    POST /api/start     - Start processing');
  console.log('    POST /api/pause     - Pause processing');
  console.log('    POST /api/resume    - Resume processing');
  console.log('    POST /api/stop      - Stop processing');
  console.log('    POST /api/flush     - Flush all data');
  console.log('    GET  /api/entities  - Get discovered entities');
  console.log('    GET  /api/relationships - Get discovered relationships');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
});

export default app;
