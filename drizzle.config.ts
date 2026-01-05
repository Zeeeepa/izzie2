import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle configuration for Neon Postgres
 *
 * This configuration enables:
 * - Schema management with Drizzle Kit
 * - Migrations to Neon serverless Postgres
 * - pgvector extension support for embeddings
 */
export default defineConfig({
  // Database connection
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },

  // Schema definition
  schema: './src/lib/db/schema.ts',

  // Migrations output directory
  out: './drizzle/migrations',

  // Enable verbose logging for debugging
  verbose: true,

  // Strict mode for safer migrations
  strict: true,
});
