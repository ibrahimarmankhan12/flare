import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  CollectionEntity,
  CollectionItemEntity,
  CollectionItemStatus,
  CollectionItemTable,
  CollectionSourceType,
  CollectionTable,
  DocumentChunkTable,
  DocumentEntity,
  DocumentTable,
} from "../schema.pg";
import { formatEmbeddingForPg } from "./memory-helpers";

// ---------------------------------------------------------------------------
// P2.1 follow-up — the ingest side of RAG.
// ---------------------------------------------------------------------------
// `src/lib/rag/retrieve.ts` has always been able to read
// `document_chunk` rows, but nothing could ever write them: the
// repositories listed as a "Next Step" in the P2.2 context entry were
// never implemented, so the knowledge base had no ingest path at all.
//
// Ownership: every mutating call takes a `userId` and scopes through
// `collection.user_id`. `collection_item`, `document`, and
// `document_chunk` have no `user_id` of their own — they inherit it
// through the FK chain — so a caller that only holds an item/document id
// must go through `assertItemOwned` / `assertCollectionOwned` first.
// Skipping that check would be an IDOR (the same class of bug the
// 2026-03-26 audit fixed in the chat actions).
// ---------------------------------------------------------------------------

export interface CreateCollectionInput {
  name: string;
  description?: string | null;
  orgId?: string | null;
}

export interface CreateCollectionItemInput {
  collectionId: string;
  sourceType: CollectionSourceType;
  sourceUrl?: string | null;
  filename?: string | null;
  mediaType?: string | null;
  status?: CollectionItemStatus;
}

export interface InsertChunkInput {
  content: string;
  position: number;
  embedding: number[];
}

export const pgCollectionRepository = {
  // --- collections -------------------------------------------------------

  async createCollection(
    input: CreateCollectionInput,
    userId: string,
  ): Promise<CollectionEntity> {
    const [row] = await db
      .insert(CollectionTable)
      .values({
        userId,
        orgId: input.orgId ?? null,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    return row as CollectionEntity;
  },

  async listCollections(userId: string): Promise<CollectionEntity[]> {
    return (await db
      .select()
      .from(CollectionTable)
      .where(eq(CollectionTable.userId, userId))
      .orderBy(desc(CollectionTable.createdAt))) as CollectionEntity[];
  },

  /** Returns null when the collection does not exist OR is not owned. */
  async getCollection(
    id: string,
    userId: string,
  ): Promise<CollectionEntity | null> {
    const [row] = await db
      .select()
      .from(CollectionTable)
      .where(
        and(eq(CollectionTable.id, id), eq(CollectionTable.userId, userId)),
      );
    return (row as CollectionEntity | undefined) ?? null;
  },

  /** Cascades to items -> documents -> chunks via FK ON DELETE CASCADE. */
  async deleteCollection(id: string, userId: string): Promise<boolean> {
    const deleted = await db
      .delete(CollectionTable)
      .where(
        and(eq(CollectionTable.id, id), eq(CollectionTable.userId, userId)),
      )
      .returning({ id: CollectionTable.id });
    return deleted.length > 0;
  },

  // --- items -------------------------------------------------------------

  async createCollectionItem(
    input: CreateCollectionItemInput,
  ): Promise<CollectionItemEntity> {
    const [row] = await db
      .insert(CollectionItemTable)
      .values({
        collectionId: input.collectionId,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? null,
        filename: input.filename ?? null,
        mediaType: input.mediaType ?? null,
        status: input.status ?? "pending",
      })
      .returning();
    return row as CollectionItemEntity;
  },

  async listCollectionItems(
    collectionId: string,
  ): Promise<CollectionItemEntity[]> {
    return (await db
      .select()
      .from(CollectionItemTable)
      .where(eq(CollectionItemTable.collectionId, collectionId))
      .orderBy(desc(CollectionItemTable.createdAt))) as CollectionItemEntity[];
  },

  async updateItemStatus(
    itemId: string,
    status: CollectionItemStatus,
    error?: string | null,
  ): Promise<void> {
    await db
      .update(CollectionItemTable)
      .set({ status, error: error ?? null, updatedAt: new Date() })
      .where(eq(CollectionItemTable.id, itemId));
  },

  /**
   * Ownership check for a caller that only holds an item id. Joins back
   * up to `collection` because `collection_item` carries no user id.
   */
  async assertItemOwned(
    itemId: string,
    userId: string,
  ): Promise<CollectionItemEntity | null> {
    const [row] = await db
      .select({ item: CollectionItemTable })
      .from(CollectionItemTable)
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .where(
        and(
          eq(CollectionItemTable.id, itemId),
          eq(CollectionTable.userId, userId),
        ),
      );
    return (row?.item as CollectionItemEntity | undefined) ?? null;
  },

  async deleteCollectionItem(itemId: string, userId: string): Promise<boolean> {
    const owned = await this.assertItemOwned(itemId, userId);
    if (!owned) return false;
    await db
      .delete(CollectionItemTable)
      .where(eq(CollectionItemTable.id, itemId));
    return true;
  },

  // --- documents + chunks ------------------------------------------------

  async createDocument(
    collectionItemId: string,
    content: string,
  ): Promise<DocumentEntity> {
    const [row] = await db
      .insert(DocumentTable)
      .values({ collectionItemId, content })
      .returning();
    return row as DocumentEntity;
  },

  async listDocumentsForItem(itemId: string): Promise<DocumentEntity[]> {
    return (await db
      .select()
      .from(DocumentTable)
      .where(eq(DocumentTable.collectionItemId, itemId))
      .orderBy(asc(DocumentTable.createdAt))) as DocumentEntity[];
  },

  /**
   * Bulk-insert chunks for one document. The embedding is passed through
   * `formatEmbeddingForPg` (validates length/NaN) and cast to `vector`
   * so pgvector accepts it. Inserted in batches because a large document
   * can produce hundreds of chunks and Postgres caps bind parameters.
   */
  async insertDocumentChunks(
    documentId: string,
    chunks: InsertChunkInput[],
    batchSize = 100,
  ): Promise<number> {
    if (chunks.length === 0) return 0;
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await db.insert(DocumentChunkTable).values(
        batch.map((c) => ({
          documentId,
          content: c.content,
          position: c.position,
          embedding: sql`${formatEmbeddingForPg(c.embedding)}::vector` as never,
        })),
      );
      inserted += batch.length;
    }
    return inserted;
  },

  /** Chunk counts per item — used by the API to report ingest results. */
  async countChunksForItems(
    itemIds: string[],
  ): Promise<Record<string, number>> {
    if (itemIds.length === 0) return {};
    const rows = await db
      .select({
        itemId: DocumentTable.collectionItemId,
        count: sql<number>`count(${DocumentChunkTable.id})::int`,
      })
      .from(DocumentChunkTable)
      .innerJoin(
        DocumentTable,
        eq(DocumentTable.id, DocumentChunkTable.documentId),
      )
      .where(inArray(DocumentTable.collectionItemId, itemIds))
      .groupBy(DocumentTable.collectionItemId);
    return Object.fromEntries(rows.map((r) => [r.itemId, Number(r.count)]));
  },
};
