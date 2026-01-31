/**
 * Environment Preloader
 *
 * This module MUST be imported first in server.ts.
 * ES modules hoist imports, so this ensures .env.local is loaded
 * before any other modules that depend on environment variables.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env.local from project root before any other imports
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

console.log('[onboarding] Loaded env from .env.local');
