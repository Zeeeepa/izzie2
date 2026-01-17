/**
 * Weaviate Client
 *
 * Singleton client for connecting to Weaviate Cloud.
 * Provides connection management and error handling.
 */

import weaviate, { WeaviateClient } from 'weaviate-client';

const LOG_PREFIX = '[Weaviate]';

let clientInstance: WeaviateClient | null = null;

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
