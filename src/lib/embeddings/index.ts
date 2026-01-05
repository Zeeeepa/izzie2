/**
 * Embeddings Service
 *
 * Generates vector embeddings using OpenAI's text-embedding-3-small model.
 * Used for semantic search in memory and knowledge graph systems.
 *
 * Model: text-embedding-3-small (1536 dimensions)
 * Cost: ~$0.02 per 1M tokens
 */

import OpenAI from 'openai';

/**
 * Embedding configuration
 */
interface EmbeddingConfig {
  model?: string;
  dimensions?: number;
}

/**
 * Embedding result
 */
interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export class EmbeddingService {
  private openai: OpenAI | null = null;
  private config: Required<EmbeddingConfig>;

  constructor(config: EmbeddingConfig = {}) {
    this.config = {
      model: config.model || 'text-embedding-3-small',
      dimensions: config.dimensions || 1536,
    };

    // Initialize OpenAI client if API key is configured
    if (this.isConfigured()) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    } else {
      console.warn(
        '[Embeddings] OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.'
      );
    }
  }

  /**
   * Check if OpenAI is configured
   */
  private isConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Check OPENROUTER_API_KEY.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      });

      const embedding = response.data[0].embedding;

      console.log(`[Embeddings] Generated embedding (${embedding.length} dimensions)`);

      return {
        embedding,
        model: this.config.model,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      console.error('[Embeddings] Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Check OPENROUTER_API_KEY.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: texts,
        dimensions: this.config.dimensions,
      });

      const embeddings = response.data.map((item, index) => ({
        embedding: item.embedding,
        model: this.config.model,
        usage: {
          // Approximate - OpenAI doesn't provide per-text usage in batch
          promptTokens: Math.floor(response.usage.prompt_tokens / texts.length),
          totalTokens: Math.floor(response.usage.total_tokens / texts.length),
        },
      }));

      console.log(
        `[Embeddings] Generated ${embeddings.length} embeddings (${embeddings[0].embedding.length} dimensions each)`
      );

      return embeddings;
    } catch (error) {
      console.error('[Embeddings] Error generating batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Generate embedding with fallback to test embedding in development
   */
  async generateEmbeddingWithFallback(text: string): Promise<number[]> {
    if (!this.isConfigured() && process.env.NODE_ENV === 'development') {
      console.warn('[Embeddings] Using random test embedding (development only)');
      return this.generateTestEmbedding();
    }

    const result = await this.generateEmbedding(text);
    return result.embedding;
  }

  /**
   * Generate a deterministic test embedding for development
   * This is NOT suitable for production - only for testing
   */
  private generateTestEmbedding(): number[] {
    // Generate deterministic random values for testing
    const seed = 42;
    const random = this.seededRandom(seed);
    return Array.from({ length: this.config.dimensions }, () => random());
  }

  /**
   * Seeded random number generator for deterministic test embeddings
   */
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
