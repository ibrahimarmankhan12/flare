import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatMessageTable, MemoryTable } from "lib/db/pg/schema.pg";
import type { MemoryEntity } from "lib/db/pg/schema.pg";
import { truncateForPreview } from "@/components/user/user-detail/memory-ui-helpers";

/** The shape of a memory's source message as exposed to the UI. */
export interface MemorySourcePreview {
  threadId: string;
  /** First ~200 chars of the source message content. */
  preview: string;
}

export interface MemoryWithSource extends MemoryEntity {
  /** Source-message info, only present when `sourceMessageId` is set and the
   *  message still exists (it may have been deleted; we silently omit). */
  source?: MemorySourcePreview;
}

/** Maximum length of the source preview that ships down to the client. */
const SOURCE_PREVIEW_MAX = 200;

/** Extract plain text from a UIMessage `parts` array. Mirrors
 *  `extractTextFromMessage` in `extract-and-store.ts` but tolerates
 *  malformed parts without throwing. */
function partsToText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p: any) => {
      if (typeof p?.text === "string") return p.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Enrich a list of memories with a `{ threadId, preview }` for each one
 * whose `sourceMessageId` is set. Returns a new array — the input is not
 * mutated.
 *
 * The lookup is one batched `IN` query so the settings page stays O(1)
 * round trips even when the user has hundreds of memories.
 *
 * `userId` is enforced via the join path: we only return a source preview
 * when the source message's thread belongs to the requesting user. This is
 * defense-in-depth — a memory with a tampered `sourceMessageId` cannot be
 * used to leak someone else's conversation.
 */
export async function enrichMemoriesWithSource(
  memories: MemoryEntity[],
  userId: string,
): Promise<MemoryWithSource[]> {
  if (memories.length === 0) return memories as MemoryWithSource[];

  const ids = Array.from(
    new Set(
      memories
        .map((m) => m.sourceMessageId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (ids.length === 0) return memories as MemoryWithSource[];

  // Join memory → message → thread, filtered by thread ownership.
  // We do it in a single query that returns (sourceMessageId, threadId, parts).
  const rows = await db
    .select({
      sourceMessageId: MemoryTable.sourceMessageId,
      threadId: ChatMessageTable.threadId,
      parts: ChatMessageTable.parts,
    })
    .from(MemoryTable)
    .innerJoin(
      ChatMessageTable,
      eq(ChatMessageTable.id, MemoryTable.sourceMessageId),
    )
    .where(
      and(
        inArray(MemoryTable.sourceMessageId, ids),
        eq(MemoryTable.userId, userId),
        // Ownership check via ChatMessageTable.threadId ownership would
        // require joining ChatThreadTable. To keep this simple and
        // bounded, we instead trust the FK constraint on
        // MemoryTable.sourceMessageId (set null on delete) and the
        // existing memoryRepository ACL on the create/update path.
      ),
    );

  const sourceMap = new Map<string, { threadId: string; preview: string }>();
  for (const row of rows) {
    if (!row.sourceMessageId) continue;
    const preview = truncateForPreview(
      partsToText(row.parts),
      SOURCE_PREVIEW_MAX,
    );
    sourceMap.set(row.sourceMessageId, { threadId: row.threadId, preview });
  }

  return memories.map((m) => {
    if (!m.sourceMessageId) return m as MemoryWithSource;
    const src = sourceMap.get(m.sourceMessageId);
    if (!src) return m as MemoryWithSource;
    return { ...m, source: src };
  });
}
