/**
 * Weaviate Client
 *
 * Singleton client for connecting to Weaviate Cloud.
 * Provides connection management, error handling, and multi-tenancy support.
 */

import weaviate, { WeaviateClient } from 'weaviate-client';

const LOG_PREFIX = '[Weaviate]';

let clientInstance: WeaviateClient | null = null;

/**
 * Cache of created tenants to avoid redundant API calls.
 * Key format: `${collectionName}:${tenantId}`
 */
const tenantCache = new Set<string>();

/**
 * Get or create Weaviate client instance
 */
export async function getWeaviateClient(): Promise<WeaviateClient> {
  if (clientInstance) {
    return clientInstance;
  }

  const url = process.env.WEAVIATE_URL;
  const apiKey = process.env.WEAVIATE_API_KEY;

  if (!url || !apiKey) {
    throw new Error(
      `${LOG_PREFIX} Missing required environment variables: WEAVIATE_URL and WEAVIATE_API_KEY`
    );
  }

  try {
    console.log(`${LOG_PREFIX} Connecting to Weaviate Cloud...`);

    clientInstance = await weaviate.connectToWeaviateCloud(url, {
      authCredentials: new weaviate.ApiKey(apiKey),
      headers: {
        'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY || '', // For vectorization if needed
      },
    });

    console.log(`${LOG_PREFIX} Successfully connected to Weaviate Cloud`);
    return clientInstance;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to connect to Weaviate:`, error);
    throw error;
  }
}

/**
 * Close Weaviate connection
 */
export async function closeWeaviateClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.close();
    clientInstance = null;
    console.log(`${LOG_PREFIX} Connection closed`);
  }
}

/**
 * Check if Weaviate is ready
 */
export async function isWeaviateReady(): Promise<boolean> {
  try {
    const client = await getWeaviateClient();
    const meta = await client.getMeta();
    return meta !== null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Health check failed:`, error);
    return false;
  }
}

/**
 * Ensure a tenant exists for a collection. Creates tenant if it doesn't exist.
 * Uses in-memory cache to avoid redundant API calls.
 *
 * @param collectionName - Name of the Weaviate collection
 * @param tenantId - Tenant identifier (typically userId)
 * @returns Promise that resolves when tenant is ready
 */
export async function ensureTenant(
  collectionName: string,
  tenantId: string
): Promise<void> {
  const cacheKey = `${collectionName}:${tenantId}`;

  // Check cache first
  if (tenantCache.has(cacheKey)) {
    return;
  }

  const client = await getWeaviateClient();
  const collection = client.collections.get(collectionName);

  try {
    // Check if tenant already exists
    // tenants.get() returns a Record<string, Tenant> where keys are tenant names
    const existingTenants = await collection.tenants.get();
    const tenantExists = tenantId in existingTenants;

    if (!tenantExists) {
      // Create the tenant
      await collection.tenants.create([{ name: tenantId }]);
      console.log(
        `${LOG_PREFIX} Created tenant '${tenantId}' for collection '${collectionName}'`
      );
    }

    // Add to cache
    tenantCache.add(cacheKey);
  } catch (error) {
    console.error(
      `${LOG_PREFIX} Failed to ensure tenant '${tenantId}' for collection '${collectionName}':`,
      error
    );
    throw error;
  }
}

/**
 * Ensure tenant exists for multiple collections at once.
 * Useful when initializing a user's data storage.
 *
 * @param collectionNames - Array of collection names
 * @param tenantId - Tenant identifier (typically userId)
 */
export async function ensureTenantForCollections(
  collectionNames: string[],
  tenantId: string
): Promise<void> {
  await Promise.all(
    collectionNames.map((name) => ensureTenant(name, tenantId))
  );
}

/**
 * Delete a tenant from a collection.
 * Used when a user deletes their account.
 *
 * @param collectionName - Name of the Weaviate collection
 * @param tenantId - Tenant identifier to delete
 */
export async function deleteTenant(
  collectionName: string,
  tenantId: string
): Promise<void> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(collectionName);

  try {
    await collection.tenants.remove([tenantId]);
    tenantCache.delete(`${collectionName}:${tenantId}`);
    console.log(
      `${LOG_PREFIX} Deleted tenant '${tenantId}' from collection '${collectionName}'`
    );
  } catch (error) {
    console.error(
      `${LOG_PREFIX} Failed to delete tenant '${tenantId}' from collection '${collectionName}':`,
      error
    );
    throw error;
  }
}

/**
 * Delete a tenant from all collections.
 * Used when a user deletes their account.
 *
 * @param collectionNames - Array of collection names
 * @param tenantId - Tenant identifier to delete
 */
export async function deleteTenantFromAllCollections(
  collectionNames: string[],
  tenantId: string
): Promise<void> {
  await Promise.all(
    collectionNames.map((name) => deleteTenant(name, tenantId))
  );
}

/**
 * Clear the tenant cache. Useful for testing or after schema changes.
 */
export function clearTenantCache(): void {
  tenantCache.clear();
  console.log(`${LOG_PREFIX} Tenant cache cleared`);
}
