import "server-only";

import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { BuildJobEntity, BuildJobTable } from "../schema.pg";

// ---------------------------------------------------------------------------
// E2B Build persistence.
// ---------------------------------------------------------------------------
// Every mutating call is user-scoped. `build_job` has a user_id of its own, so
// ownership is a direct predicate rather than a join (unlike collection_item).
//
// `sandboxId` is what makes a build resumable: the workspace looks up the job,
// reconnects to that sandbox, and only regenerates if the sandbox is gone.
// `findReclaimable` backs a cleanup pass so expired sandboxes do not sit
// billing after their session ends.
// ---------------------------------------------------------------------------

export type BuildStatus =
  | "queued"
  | "planning"
  | "generating"
  | "installing"
  | "running"
  | "ready"
  | "failed";

export interface CreateBuildJobInput {
  id: string;
  threadId: string;
  prompt: string;
  assistantMessageId?: string | null;
  toolCallId?: string | null;
  framework?: string | null;
  title?: string | null;
}

export interface UpdateBuildJobInput {
  status?: BuildStatus;
  title?: string | null;
  summary?: string | null;
  files?: { path: string; content: string }[];
  previewUrl?: string | null;
  sandboxId?: string | null;
  sandboxExpiresAt?: Date | null;
  error?: string | null;
}

export const pgBuildJobRepository = {
  async create(
    input: CreateBuildJobInput,
    userId: string,
  ): Promise<BuildJobEntity> {
    const [row] = await db
      .insert(BuildJobTable)
      .values({
        id: input.id,
        userId,
        threadId: input.threadId,
        prompt: input.prompt,
        assistantMessageId: input.assistantMessageId ?? null,
        toolCallId: input.toolCallId ?? null,
        framework: input.framework ?? null,
        title: input.title ?? null,
        status: "queued",
      })
      // The API route inserts the row up-front so it can return an id
      // immediately; the runner then calls create() again. Make that a no-op
      // instead of a duplicate-key error.
      .onConflictDoNothing()
      .returning();
    if (row) return row as BuildJobEntity;
    const existing = await db
      .select()
      .from(BuildJobTable)
      .where(eq(BuildJobTable.id, input.id));
    return existing[0] as BuildJobEntity;
  },

  /** Null when missing OR not owned — callers cannot probe other users' ids. */
  async getById(id: string, userId: string): Promise<BuildJobEntity | null> {
    const [row] = await db
      .select()
      .from(BuildJobTable)
      .where(and(eq(BuildJobTable.id, id), eq(BuildJobTable.userId, userId)));
    return (row as BuildJobEntity | undefined) ?? null;
  },

  async listByUser(userId: string, limit = 50): Promise<BuildJobEntity[]> {
    return (await db
      .select()
      .from(BuildJobTable)
      .where(eq(BuildJobTable.userId, userId))
      .orderBy(desc(BuildJobTable.createdAt))
      .limit(limit)) as BuildJobEntity[];
  },

  async listByThread(
    threadId: string,
    userId: string,
  ): Promise<BuildJobEntity[]> {
    return (await db
      .select()
      .from(BuildJobTable)
      .where(
        and(
          eq(BuildJobTable.threadId, threadId),
          eq(BuildJobTable.userId, userId),
        ),
      )
      .orderBy(desc(BuildJobTable.createdAt))) as BuildJobEntity[];
  },

  async update(
    id: string,
    userId: string,
    patch: UpdateBuildJobInput,
  ): Promise<BuildJobEntity | null> {
    const [row] = await db
      .update(BuildJobTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(BuildJobTable.id, id), eq(BuildJobTable.userId, userId)))
      .returning();
    return (row as BuildJobEntity | undefined) ?? null;
  },

  /**
   * Internal status write for server-side workers that already established
   * ownership (e.g. the build runner). Not reachable from a request handler
   * without a prior ownership check.
   */
  async setStatusUnscoped(
    id: string,
    patch: UpdateBuildJobInput,
  ): Promise<void> {
    await db
      .update(BuildJobTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(BuildJobTable.id, id));
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const rows = await db
      .delete(BuildJobTable)
      .where(and(eq(BuildJobTable.id, id), eq(BuildJobTable.userId, userId)))
      .returning({ id: BuildJobTable.id });
    return rows.length > 0;
  },

  /**
   * Jobs still holding a sandbox whose lease has expired. Used by the cleanup
   * pass so abandoned sandboxes are killed instead of billing indefinitely.
   */
  async findReclaimable(
    now = new Date(),
    limit = 50,
  ): Promise<BuildJobEntity[]> {
    return (await db
      .select()
      .from(BuildJobTable)
      .where(
        and(
          isNotNull(BuildJobTable.sandboxId),
          isNotNull(BuildJobTable.sandboxExpiresAt),
          lt(BuildJobTable.sandboxExpiresAt, now),
        ),
      )
      .limit(limit)) as BuildJobEntity[];
  },

  /**
   * Existence check for reconciliation. Unscoped by design: the reaper starts
   * from an E2B sandbox (which carries only metadata, not a session) and needs
   * to know whether ANY build row still references it. Never call this from a
   * request handler — use `getById` there so ownership is enforced.
   */
  async existsUnscoped(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: BuildJobTable.id })
      .from(BuildJobTable)
      .where(eq(BuildJobTable.id, id));
    return Boolean(row);
  },

  /** Clear the sandbox handle once it has been killed. */
  async releaseSandbox(id: string): Promise<void> {
    await db
      .update(BuildJobTable)
      .set({
        sandboxId: null,
        sandboxExpiresAt: null,
        previewUrl: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(BuildJobTable.id, id));
  },
};
