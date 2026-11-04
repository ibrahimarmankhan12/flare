import { pgDb as db } from "../db.pg";
import { MemoryTable, MemoryEntity } from "../schema.pg";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  buildScopeConditions,
  formatEmbeddingForPg,
  MemoryScope,
  MemorySearchOptions,
  MemoryWithScore,
  orderByRelevance,
  scoreExpression,
} from "./memory-helpers";

export interface CreateMemoryInput {
  userId: string;
  content: string;
  category?: string | null;
  scope?: MemoryScope;
  scopeId?: string | null;
  sourceMessageId?: string | null;
  confidence?: number | null;
  isPinned?: boolean;
  embedding?: number[] | null;
}

export interface UpdateMemoryInput {
  content?: string;
  category?: string | null;
  scope?: MemoryScope;
  scopeId?: string | null;
  confidence?: number | null;
  isPinned?: boolean;
  embedding?: number[] | null;
}

export interface MemoryRepository {
  /** All memories for a user, ordered by most recently updated. Used by the
   *  memory settings UI. Not used on the chat hot path. */
  getAll(userId: string): Promise<MemoryEntity[]>;

  /** Keyword search (ILIKE). Kept for the memory tool and for legacy rows
   *  without embeddings. */
  search(userId: string, query: string): Promise<MemoryEntity[]>;

  /** Create a memory. New fields (scope, embedding, ...) are optional and
   *  default to "user" scope with no embedding. */
  create(input: CreateMemoryInput): Promise<MemoryEntity>;

  /** Update a memory by id. Only the fields provided are written. */
  update(
    id: string,
    userId: string,
    input: UpdateMemoryInput,
  ): Promise<MemoryEntity | null>;

  /** Delete a single memory. */
  delete(id: string, userId: string): Promise<boolean>;

  /** Delete all memories for a user. Returns the count deleted. */
  deleteAll(userId: string): Promise<number>;

  // === Phase 1+#1 — vector search ===

  /** Cosine-similarity top-k. Pinned memories come first. The `score` field
   *  is in [0, 1] where 1 = most similar. */
  searchByVector(
    userId: string,
    embedding: number[],
    options?: MemorySearchOptions,
  ): Promise<MemoryWithScore[]>;

  /** Convenience for the chat hot path. Default k=20. */
  getTopKForPrompt(
    userId: string,
    queryEmbedding: number[],
    k?: number,
    options?: MemorySearchOptions,
  ): Promise<MemoryWithScore[]>;

  /** Populate the embedding column for an existing memory (e.g. after
   *  auto-extraction in P1.3 or backfill in P1.6). */
  updateEmbedding(
    id: string,
    userId: string,
    embedding: number[],
  ): Promise<MemoryEntity | null>;

  /** Memories filtered by scope. Useful for admin/inspector views. */
  getScoped(
    userId: string,
    scope: MemoryScope,
    scopeId?: string,
  ): Promise<MemoryEntity[]>;

  /** Memories in a single category, most-recent first. */
  getByCategory(
    userId: string,
    category: string,
    limit?: number,
  ): Promise<MemoryEntity[]>;
}

export const pgMemoryRepository: MemoryRepository = {
  getAll: async (userId: string): Promise<MemoryEntity[]> => {
    return db
      .select()
      .from(MemoryTable)
      .where(eq(MemoryTable.userId, userId))
      .orderBy(desc(MemoryTable.updatedAt));
  },

  search: async (userId: string, query: string): Promise<MemoryEntity[]> => {
    const terms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `%${t}%`);

    if (terms.length === 0) {
      return db
        .select()
        .from(MemoryTable)
        .where(eq(MemoryTable.userId, userId))
        .orderBy(desc(MemoryTable.updatedAt))
        .limit(20);
    }

    return db
      .select()
      .from(MemoryTable)
      .where(
        and(
          eq(MemoryTable.userId, userId),
          sql`(${terms.map((t) => sql`${MemoryTable.content} ILIKE ${t} OR ${MemoryTable.category} ILIKE ${t}`).reduce((a, b) => sql`${a} OR ${b}`)})`,
        ),
      )
      .orderBy(desc(MemoryTable.updatedAt))
      .limit(20);
  },

  create: async (input: CreateMemoryInput): Promise<MemoryEntity> => {
    const [result] = await db
      .insert(MemoryTable)
      .values({
        userId: input.userId,
        content: input.content,
        category: input.category ?? null,
        scope: input.scope ?? "user",
        scopeId: input.scopeId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        confidence: input.confidence ?? null,
        isPinned: input.isPinned ?? false,
        // embedding is a special column; convert to pgvector literal if set.
        // The Drizzle vector type handles the conversion via mapToDriverValue,
        // so we can pass the number[] directly.
        ...(input.embedding ? { embedding: input.embedding as any } : {}),
      })
      .returning();
    return result as MemoryEntity;
  },

  update: async (
    id: string,
    userId: string,
    input: UpdateMemoryInput,
  ): Promise<MemoryEntity | null> => {
    const setObj: Record<string, unknown> = { updatedAt: new Date() };
    if (input.content !== undefined) setObj.content = input.content;
    if (input.category !== undefined) setObj.category = input.category;
    if (input.scope !== undefined) setObj.scope = input.scope;
    if (input.scopeId !== undefined) setObj.scopeId = input.scopeId;
    if (input.confidence !== undefined) setObj.confidence = input.confidence;
    if (input.isPinned !== undefined) setObj.isPinned = input.isPinned;
    if (input.embedding !== undefined) {
      setObj.embedding = input.embedding
        ? (input.embedding as any)
        : null;
    }

    const [result] = await db
      .update(MemoryTable)
      .set(setObj)
      .where(and(eq(MemoryTable.id, id), eq(MemoryTable.userId, userId)))
      .returning();
    return (result as MemoryEntity) ?? null;
  },

  delete: async (id: string, userId: string): Promise<boolean> => {
    const result = await db
      .delete(MemoryTable)
      .where(and(eq(MemoryTable.id, id), eq(MemoryTable.userId, userId)))
      .returning({ id: MemoryTable.id });
    return result.length > 0;
  },

  deleteAll: async (userId: string): Promise<number> => {
    const result = await db
      .delete(MemoryTable)
      .where(eq(MemoryTable.userId, userId))
      .returning({ id: MemoryTable.id });
    return result.length;
  },

  searchByVector: async (
    userId: string,
    embedding: number[],
    options: MemorySearchOptions = {},
  ): Promise<MemoryWithScore[]> => {
    const embeddingLiteral = formatEmbeddingForPg(embedding);
    const conditions = buildScopeConditions(userId, options);
    const limit = options.limit ?? 20;

    const rows = await db
      .select({
        id: MemoryTable.id,
        userId: MemoryTable.userId,
        content: MemoryTable.content,
        category: MemoryTable.category,
        embedding: MemoryTable.embedding,
        scope: MemoryTable.scope,
        scopeId: MemoryTable.scopeId,
        sourceMessageId: MemoryTable.sourceMessageId,
        confidence: MemoryTable.confidence,
        isPinned: MemoryTable.isPinned,
        createdAt: MemoryTable.createdAt,
        updatedAt: MemoryTable.updatedAt,
        score: scoreExpression(embeddingLiteral),
      })
      .from(MemoryTable)
      .where(and(...conditions))
      .orderBy(...orderByRelevance(embeddingLiteral))
      .limit(limit);

    return rows as MemoryWithScore[];
  },

  getTopKForPrompt: async (
    userId: string,
    queryEmbedding: number[],
    k: number = 20,
    options: MemorySearchOptions = {},
  ): Promise<MemoryWithScore[]> => {
    return pgMemoryRepository.searchByVector(userId, queryEmbedding, {
      ...options,
      limit: k,
    });
  },

  updateEmbedding: async (
    id: string,
    userId: string,
    embedding: number[],
  ): Promise<MemoryEntity | null> => {
    const [result] = await db
      .update(MemoryTable)
      .set({
        embedding: embedding as any,
        updatedAt: new Date(),
      })
      .where(and(eq(MemoryTable.id, id), eq(MemoryTable.userId, userId)))
      .returning();
    return (result as MemoryEntity) ?? null;
  },

  getScoped: async (
    userId: string,
    scope: MemoryScope,
    scopeId?: string,
  ): Promise<MemoryEntity[]> => {
    if (scope === "user") {
      return db
        .select()
        .from(MemoryTable)
        .where(and(eq(MemoryTable.userId, userId), eq(MemoryTable.scope, "user")))
        .orderBy(desc(MemoryTable.updatedAt));
    }
    if (!scopeId) return [];
    return db
      .select()
      .from(MemoryTable)
      .where(
        and(
          eq(MemoryTable.userId, userId),
          eq(MemoryTable.scope, scope),
          eq(MemoryTable.scopeId, scopeId),
        ),
      )
      .orderBy(desc(MemoryTable.updatedAt));
  },

  getByCategory: async (
    userId: string,
    category: string,
    limit: number = 50,
  ): Promise<MemoryEntity[]> => {
    return db
      .select()
      .from(MemoryTable)
      .where(
        and(eq(MemoryTable.userId, userId), eq(MemoryTable.category, category)),
      )
      .orderBy(desc(MemoryTable.updatedAt))
      .limit(limit);
  },
};
