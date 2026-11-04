import "server-only";
import { SQL, and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { embedText } from "lib/ai/memory/embed";
import { pgDb as db } from "lib/db/pg/db.pg";
import { formatEmbeddingForPg } from "lib/db/pg/repositories/memory-helpers";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentChunkTable,
  DocumentTable,
} from "lib/db/pg/schema.pg";
import type { RetrievedChunk } from "lib/rag/format";

// Re-export the rich shape so callers (chat route, tests) can import
// `RetrievedChunk` from either `lib/rag/retrieve` (the producer) or
// `lib/rag/format` (the consumer) without a type-shape mismatch.
export type { RetrievedChunk };

/**
 * P2.2 — vector retrieval for the file-collection RAG system.
 *
 * Given a user-supplied natural-language query, return the top-k
 * `document_chunk` rows whose embeddings are closest (cosine) to the
 * query, scoped to that user's collections.
 *
 * The join chain is `document_chunk -> document -> collection_item ->
 * collection`, and the user-scope filter is applied on
 * `collection.userId`. An optional `collectionIds` allow-list further
 * narrows the search to specific collections (e.g. the user picked
 * three collections from the sidebar).
 *
 * Chunks whose similarity is below `minScore` are dropped before return
 * so the caller can trust the returned array to be "good enough" without
 * having to filter again.
 *
 * P2.3 follow-up: the returned shape now matches the rich
 * `RetrievedChunk` from `lib/rag/format` (with `position`,
 * `collectionItemId`, `filename`, `sourceUrl`) so the chat route does
 * not need a second round-trip to enrich the rows for the prompt
 * section and citation UI.
 */

export const DEFAULT_RETRIEVE_TOP_K = 5 as const;
export const DEFAULT_RETRIEVE_MIN_SCORE = 0.5 as const;

/**
 * Build the WHERE-clause SQL fragments used by `retrieveRelevantChunks`.
 * Pure function — no DB access — so it is unit-testable without a live
 * Postgres connection.
 */
export interface RetrieveOptions {
  /** Restrict the search to these collections. Defaults to all of the
   *  user's collections. */
  collectionIds?: string[];
  /** Maximum number of chunks to return. Defaults to 5. */
  topK?: number;
  /** Drop chunks with similarity < minScore. Defaults to 0.5. */
  minScore?: number;
}

export interface BuildRetrieveConditionsInput {
  userId: string;
  collectionIds?: string[];
}

/**
 * Build the WHERE-clause SQL fragments used by `retrieveRelevantChunks`.
 * Pure function — no DB access — so it is unit-testable without a live
 * Postgres connection.
 *
 * The fragments must be ANDed together by the caller.
 */
export function buildRetrieveConditions({
  userId,
  collectionIds,
}: BuildRetrieveConditionsInput): SQL[] {
  const conditions: SQL[] = [
    eq(CollectionTable.userId, userId),
    // Chunks without an embedding can't participate in vector search; the
    // HNSW index won't include them either. Filtering here keeps the
    // query plan simple.
    isNotNull(DocumentChunkTable.embedding),
  ];
  if (collectionIds && collectionIds.length > 0) {
    conditions.push(inArray(CollectionItemTable.collectionId, collectionIds));
  }
  return conditions;
}

/**
 * Compute the cosine-similarity SELECT expression for the chunk table.
 * Mirrors `scoreExpression` in memory-helpers.ts — pgvector's `<=>`
 * returns cosine distance, so we negate it.
 */
function chunkScoreExpression(embeddingLiteral: string): SQL<number> {
  return sql<number>`1 - (${DocumentChunkTable.embedding} <=> ${embeddingLiteral}::vector)`;
}

/**
 * Embed `query`, search the user's chunks by cosine distance, drop rows
 * below `minScore`, and return the survivors in similarity order.
 */
export async function retrieveRelevantChunks(
  userId: string,
  query: string,
  options?: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  if (!userId) throw new Error("retrieveRelevantChunks: userId is required");
  if (!query || !query.trim()) {
    throw new Error("retrieveRelevantChunks: query is required");
  }

  const topK = options?.topK ?? DEFAULT_RETRIEVE_TOP_K;
  const minScore = options?.minScore ?? DEFAULT_RETRIEVE_MIN_SCORE;
  if (!Number.isFinite(topK) || topK <= 0) {
    throw new Error(
      `retrieveRelevantChunks: topK must be a positive number, got ${topK}`,
    );
  }
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new Error(
      `retrieveRelevantChunks: minScore must be in [0, 1], got ${minScore}`,
    );
  }

  // 1. Embed the query with the same model used at ingest time so the
  //    similarity comparison is meaningful. The wrapper validates
  //    dimensions and throws if the API key is missing.
  const { embedding } = await embedText(query);

  // 2. Vector search.
  const embeddingLiteral = formatEmbeddingForPg(embedding);
  const conditions = buildRetrieveConditions({
    userId,
    collectionIds: options?.collectionIds,
  });

  // Pull one extra row beyond topK so we can drop the worst one if it's
  // just under the threshold without starving the limit. Cap at topK*2
  // (and at 20 absolute) to avoid pathological over-fetch on large
  // libraries.
  const fetchLimit = Math.max(topK, Math.min(topK * 2, 20));

  const rows = await db
    .select({
      id: DocumentChunkTable.id,
      content: DocumentChunkTable.content,
      position: DocumentChunkTable.position,
      documentId: DocumentChunkTable.documentId,
      collectionId: CollectionItemTable.collectionId,
      collectionItemId: CollectionItemTable.id,
      filename: CollectionItemTable.filename,
      sourceUrl: CollectionItemTable.sourceUrl,
      score: chunkScoreExpression(embeddingLiteral),
    })
    .from(DocumentChunkTable)
    .innerJoin(
      DocumentTable,
      eq(DocumentTable.id, DocumentChunkTable.documentId),
    )
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, DocumentTable.collectionItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(and(...conditions))
    .orderBy(
      sql`${DocumentChunkTable.embedding} <=> ${embeddingLiteral}::vector ASC`,
    )
    .limit(fetchLimit);

  // 3. Apply the post-DB score filter and final cap.
  return rows.filter((row) => row.score >= minScore).slice(0, topK);
}
