import "server-only";
import { embed } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { EMBEDDING_DIMENSIONS } from "lib/db/pg/repositories/memory-helpers";
import logger from "logger";

/**
 * Embedding wrapper for the memory system. Defaults to the Flare provider
 * (api.flare-sh.tech, OpenAI-compatible); in this deployment
 * FLARE_EMBED_BASE_URL points at a local Ollama (nomic-embed-text) for
 * 768-dim vectors that match the `user_memory.embedding` column and the
 * HNSW index added in P1.1.
 *
 * The Flare provider is used because:
 *   - `FLARE_API_KEY` is already in the project's `.env.example`.
 *   - It's OpenAI-compatible, so the same code works for any
 *     OpenAI-compatible endpoint (just change `baseURL`).
 *
 * To swap providers later (e.g. native OpenAI), only this file changes.
 */

const FALLBACK_EMBEDDING_MODEL = "text-embedding-3-small" as const;
const FALLBACK_BASE_URL = "https://api.flare-sh.tech/v1" as const;

let cachedProvider: ReturnType<typeof createOpenAICompatible> | null = null;

const getProvider = () => {
  if (cachedProvider) return cachedProvider;
  const apiKey =
    process.env.FLARE_API_KEY || process.env.KORE_API_KEY || undefined;
  if (!apiKey) {
    throw new Error(
      "embedText: FLARE_API_KEY (or KORE_API_KEY) is required for memory embeddings. " +
        "Set one in your .env to enable memory auto-extraction.",
    );
  }
  cachedProvider = createOpenAICompatible({
    name: "flare-embeddings",
    apiKey,
    baseURL: process.env.FLARE_EMBED_BASE_URL || FALLBACK_BASE_URL,
    headers: {
      ...(process.env.FLARE_ORIGIN && { Origin: process.env.FLARE_ORIGIN }),
      ...(process.env.FLARE_REFERER && { Referer: process.env.FLARE_REFERER }),
    },
  });
  return cachedProvider;
};

const resolveModelId = () =>
  process.env.FLARE_EMBED_MODEL || FALLBACK_EMBEDDING_MODEL;

export interface EmbedResult {
  embedding: number[];
  model: string;
  tokens?: number;
}

/**
 * Embed a single piece of text. Returns a vector of length EMBEDDING_DIMENSIONS
 * (1536). Throws if the API key is missing or the upstream returns a vector
 * of the wrong shape.
 */
export const embedText = async (text: string): Promise<EmbedResult> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("embedText: cannot embed empty text");
  }

  const provider = getProvider();
  const modelId = resolveModelId();
  const { embedding, usage } = await embed({
    model: provider.textEmbeddingModel(modelId),
    value: trimmed,
  });

  if (!Array.isArray(embedding)) {
    throw new Error(
      `embedText: expected array, got ${typeof embedding} from model ${modelId}`,
    );
  }
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    logger.warn(
      `Embedding dimension mismatch: model ${modelId} returned ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}. ` +
        `Migration: update user_memory.embedding and the HNSW index to vector(${embedding.length}).`,
    );
  }

  return {
    embedding,
    model: modelId,
    tokens: usage?.tokens,
  };
};

/**
 * Embed multiple texts in a single API call (when supported). Falls back to
 * sequential calls if the provider rejects batching.
 */
export const embedBatch = async (texts: string[]): Promise<EmbedResult[]> => {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await embedText(texts[0]!)];

  // The `embedMany` helper from `ai` is the standard batch path.
  const { embedMany } = await import("ai");
  const provider = getProvider();
  const modelId = resolveModelId();
  const { embeddings, usage } = await embedMany({
    model: provider.textEmbeddingModel(modelId),
    values: texts.map((t) => t.trim()),
  });

  if (embeddings.length !== texts.length) {
    throw new Error(
      `embedBatch: expected ${texts.length} embeddings, got ${embeddings.length}`,
    );
  }
  return embeddings.map((embedding, i) => ({
    embedding,
    model: modelId,
    tokens: usage && Array.isArray(usage.tokens) ? usage.tokens[i] : undefined,
  }));
};
