import { and, eq, gte, isNotNull, isNull, or, sql, SQL } from "drizzle-orm";
import type { MemoryEntity } from "../schema.pg";
import { MemoryTable } from "../schema.pg";

/**
 * Pure helpers for the memory repository. No DB imports here — these are
 * unit-testable without a live database and reusable from scripts/backfill
 * jobs, RAG retrieval, and the chat route's system-prompt builder.
 *
 * Companion to memory-repository.pg.ts.
 */

export const EMBEDDING_DIMENSIONS = 1536 as const;

export type MemoryScope = "user" | "agent" | "thread";

export interface MemorySearchOptions {
  /** When set, include memories scoped to this agent id. */
  agentId?: string;
  /** When set, include memories scoped to this thread id. */
  threadId?: string;
  /** Include pinned memories (default: true). Pinned memories are returned
   *  first regardless of similarity. */
  includePinned?: boolean;
  /** Minimum confidence in [0, 1]. Defaults to 0. */
  minConfidence?: number;
  /** Max results to return. Default 20. */
  limit?: number;
}

export interface MemoryWithScore extends MemoryEntity {
  /** Cosine similarity in [0, 1] where 1 = identical. */
  score: number;
}

/**
 * Format a JS number array as a Postgres `vector` literal.
 * Example: `[0.1, 0.2]` → `'[0.1,0.2]'`.
 *
 * Throws if the array is empty (pgvector requires a fixed dimension).
 */
export function formatEmbeddingForPg(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new Error("Cannot format empty embedding for Postgres vector");
  }
  // pgvector accepts a comma-separated list inside brackets. Numbers are
  // coerced to strings; NaN/Infinity become "NaN"/"Infinity" which Postgres
  // will reject. We pre-validate to keep error messages clear.
  for (let i = 0; i < embedding.length; i += 1) {
    const v = embedding[i];
    if (!Number.isFinite(v)) {
      throw new Error(
        `Embedding contains non-finite value at index ${i}: ${v as number}`,
      );
    }
  }
  return `[${embedding.join(",")}]`;
}

/**
 * Build the WHERE-clause fragments for a vector search. Centralised so the
 * chat route and the backfill script can both reuse the same scope rules.
 *
 * Returns a list of SQL fragments; caller ANDs them together.
 */
export function buildScopeConditions(
  userId: string,
  options: MemorySearchOptions,
): SQL[] {
  const conditions: SQL[] = [
    eq(MemoryTable.userId, userId),
    isNotNull(MemoryTable.embedding),
  ];

  const minConfidence = options.minConfidence ?? 0;
  if (minConfidence > 0) {
    conditions.push(gte(MemoryTable.confidence, minConfidence));
  } else {
    // Default: hide NULL-confidence rows so they don't get ranked on the
    // back of everyone else. (Confidence comes from the LLM extraction pass;
    // manually-created memories get null.)
    conditions.push(
      or(isNull(MemoryTable.confidence), gte(MemoryTable.confidence, 0))!,
    );
  }

  // Scope fan-out: a single search surfaces user-scope, active-agent-scope,
  // and active-thread-scope memories in one call.
  const scopeClauses: SQL[] = [eq(MemoryTable.scope, "user")];
  if (options.agentId) {
    scopeClauses.push(
      and(
        eq(MemoryTable.scope, "agent"),
        eq(MemoryTable.scopeId, options.agentId),
      )!,
    );
  }
  if (options.threadId) {
    scopeClauses.push(
      and(
        eq(MemoryTable.scope, "thread"),
        eq(MemoryTable.scopeId, options.threadId),
      )!,
    );
  }
  conditions.push(or(...scopeClauses)!);

  return conditions;
}

/**
 * Compute the cosine-similarity score expression for SELECT.
 * pgvector's `<=>` returns cosine distance (1 - similarity), so we negate it.
 */
export function scoreExpression(embeddingLiteral: string): SQL<number> {
  return sql<number>`1 - (${MemoryTable.embedding} <=> ${embeddingLiteral}::vector)`;
}

/**
 * Compute the order-by expression for vector search. Pinned memories come
 * first; the rest are ordered by ascending cosine distance.
 */
export function orderByRelevance(embeddingLiteral: string): SQL[] {
  return [
    sql`${MemoryTable.isPinned} DESC`,
    sql`${MemoryTable.embedding} <=> ${embeddingLiteral}::vector ASC`,
  ];
}
