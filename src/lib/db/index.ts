/**
 * Database Module - Neon Postgres with pgvector
 *
 * Exports:
 * - dbClient: Singleton database client
 * - vectorOps: Vector operations service
 * - schema: Database schema definitions
 */

export { dbClient, NeonClient, schema } from './client';
export { vectorOps, VectorOperations } from './vectors';
export type { VectorSearchResult } from './vectors';
export * from './schema';
