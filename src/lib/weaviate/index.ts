/**
 * Weaviate Integration
 *
 * Export all Weaviate functionality for easy imports.
 */

export { getWeaviateClient, closeWeaviateClient, isWeaviateReady } from './client';
export { initializeSchema, deleteAllCollections, COLLECTIONS } from './schema';
export {
  saveEntities,
  searchEntities,
  getEntitiesBySource,
  deleteEntitiesBySource,
  getEntityStats,
} from './entities';
