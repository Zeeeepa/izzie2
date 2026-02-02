/**
 * Weaviate Integration
 *
 * Export all Weaviate functionality for easy imports.
 */

export {
  getWeaviateClient,
  closeWeaviateClient,
  isWeaviateReady,
  ensureTenant,
  ensureTenantForCollections,
  deleteTenant,
  deleteTenantFromAllCollections,
  clearTenantCache,
} from './client';
export {
  initializeSchema,
  deleteAllCollections,
  COLLECTIONS,
  RELATIONSHIP_COLLECTION,
  MEMORY_COLLECTION,
  RESEARCH_FINDING_COLLECTION_NAME,
  ALL_MULTI_TENANT_COLLECTIONS,
} from './schema';
export {
  saveEntities,
  searchEntities,
  getEntitiesBySource,
  deleteEntitiesBySource,
  getEntityStats,
  listEntitiesByType,
} from './entities';
export {
  saveRelationships,
  getEntityRelationships,
  getAllRelationships,
  buildRelationshipGraph,
  getRelationshipStats,
  deleteRelationshipsBySource,
  deleteRelationshipById,
  deleteAllRelationships,
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
