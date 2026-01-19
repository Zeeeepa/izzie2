/**
 * Weaviate Integration
 *
 * Export all Weaviate functionality for easy imports.
 */

export { getWeaviateClient, closeWeaviateClient, isWeaviateReady } from './client';
export { initializeSchema, deleteAllCollections, COLLECTIONS, RELATIONSHIP_COLLECTION } from './schema';
export {
  saveEntities,
  searchEntities,
  getEntitiesBySource,
  deleteEntitiesBySource,
  getEntityStats,
} from './entities';
export {
  saveRelationships,
  getEntityRelationships,
  getAllRelationships,
  buildRelationshipGraph,
  getRelationshipStats,
  deleteRelationshipsBySource,
} from './relationships';
export {
  initResearchFindingSchema,
  saveFinding,
  saveFindings,
  searchFindings,
  getFindingsByTask,
  deleteFindingsByTask,
  RESEARCH_FINDING_COLLECTION,
} from './research-findings';
