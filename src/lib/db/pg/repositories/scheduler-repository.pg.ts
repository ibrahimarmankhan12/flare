import "server-only";

import { and, desc, eq, lte, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  NewScheduledJob,
  NewScheduledRun,
  ScheduledJob,
  ScheduledJobTable,
  ScheduledRun,
  ScheduledRunTable,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P3.0 schema foundation — scheduler repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `scheduled_job` + `scheduled_run` tables. The actual
// cron parser / run-execution logic lives in P3.1 (src/lib/scheduler/).
// This file is a thin data-access layer:
//   * createScheduledJob / listScheduledJobs / getScheduledJob — basic CRUD,
//     always scoped to a user.
//   * updateScheduledJob / deleteScheduledJob — owner-scoped patches.
//   * claimDueScheduledJobs — the worker-facing atomic claim: returns any
//     rows whose status='active' and next_run_at <= now.
//   * createScheduledRun / updateScheduledRun / listScheduledRuns — runs
//     are an append-only audit trail of attempts.
// ---------------------------------------------------------------------------

export interface CreateScheduledJobInput {
  agentId?: string | null;
  name: string;
  cron: string;
  payload?: Record<string, unknown>;
  nextRunAt: Date;
  status?: "active" | "paused" | "disabled";
}

export interface UpdateScheduledJobInput {
  name?: string;
  cron?: string;
  payload?: Record<string, unknown>;
  nextRunAt?: Date;
  lastRunAt?: Date | null;
  status?: "active" | "paused" | "disabled";
}

export interface UpdateScheduledRunInput {
  status?: "running" | "completed" | "failed" | "skipped";
  completedAt?: Date | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
}

export const schedulerRepository = {
  async createScheduledJob(
    input: CreateScheduledJobInput,
    userId: string,
  ): Promise<ScheduledJob> {
    const [row] = await db
      .insert(ScheduledJobTable)
      .values({
        userId,
        agentId: input.agentId ?? null,
        name: input.name,
        cron: input.cron,
        payload: input.payload ?? {},
        nextRunAt: input.nextRunAt,
        status: input.status ?? "active",
      } satisfies NewScheduledJob)
      .returning();
    return row as ScheduledJob;
  },

  async listScheduledJobs(userId: string): Promise<ScheduledJob[]> {
    return (await db
      .select()
      .from(ScheduledJobTable)
      .where(eq(ScheduledJobTable.userId, userId))
      .orderBy(desc(ScheduledJobTable.createdAt))) as ScheduledJob[];
  },

  async getScheduledJob(
    id: string,
    userId: string,
  ): Promise<ScheduledJob | null> {
    const [row] = await db
      .select()
      .from(ScheduledJobTable)
      .where(
        and(eq(ScheduledJobTable.id, id), eq(ScheduledJobTable.userId, userId)),
      );
    return (row as ScheduledJob | undefined) ?? null;
  },

  async updateScheduledJob(
    id: string,
    userId: string,
    patch: UpdateScheduledJobInput,
  ): Promise<ScheduledJob | null> {
    const [row] = await db
      .update(ScheduledJobTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
        ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
        ...(patch.nextRunAt !== undefined
          ? { nextRunAt: patch.nextRunAt }
          : {}),
        ...(patch.lastRunAt !== undefined
          ? { lastRunAt: patch.lastRunAt }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(ScheduledJobTable.id, id), eq(ScheduledJobTable.userId, userId)),
      )
      .returning();
    return (row as ScheduledJob | undefined) ?? null;
  },

  async deleteScheduledJob(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(ScheduledJobTable)
      .where(
        and(eq(ScheduledJobTable.id, id), eq(ScheduledJobTable.userId, userId)),
      )
      .returning({ id: ScheduledJobTable.id });
    return result.length > 0;
  },

  /**
   * Worker-facing atomic claim. Returns active jobs whose `next_run_at`
   * is at or before `now`, ordered by `next_run_at` ascending. The
   * caller is responsible for actually executing the run and updating
   * `last_run_at` / `next_run_at` — this method does NOT mutate either.
   * (Mutating during select would require a `FOR UPDATE SKIP LOCKED` and
   * a leader-election boundary; that's P3.1's concern.)
   */
  async claimDueScheduledJobs(
    now: Date,
    limit: number,
  ): Promise<ScheduledJob[]> {
    return (await db
      .select()
      .from(ScheduledJobTable)
      .where(
        and(
          eq(ScheduledJobTable.status, "active"),
          lte(ScheduledJobTable.nextRunAt, now),
        ),
      )
      .orderBy(ScheduledJobTable.nextRunAt)
      .limit(limit)) as ScheduledJob[];
  },

  async createScheduledRun(jobId: string): Promise<ScheduledRun> {
    const [row] = await db
      .insert(ScheduledRunTable)
      .values({
        scheduledJobId: jobId,
      } satisfies NewScheduledRun)
      .returning();
    return row as ScheduledRun;
  },

  async updateScheduledRun(
    id: string,
    patch: UpdateScheduledRunInput,
  ): Promise<ScheduledRun | null> {
    const [row] = await db
      .update(ScheduledRunTable)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.completedAt !== undefined
          ? { completedAt: patch.completedAt }
          : {}),
        ...(patch.output !== undefined ? { output: patch.output } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      })
      .where(eq(ScheduledRunTable.id, id))
      .returning();
    return (row as ScheduledRun | undefined) ?? null;
  },

  async listScheduledRuns(
    jobId: string,
    userId: string,
    limit = 50,
  ): Promise<ScheduledRun[]> {
    // Join through the job so we can enforce the owner-scope at the
    // query level — a run is only visible if its parent job belongs to
    // the calling user.
    return (await db
      .select({
        id: ScheduledRunTable.id,
        scheduledJobId: ScheduledRunTable.scheduledJobId,
        startedAt: ScheduledRunTable.startedAt,
        completedAt: ScheduledRunTable.completedAt,
        status: ScheduledRunTable.status,
        output: ScheduledRunTable.output,
        error: ScheduledRunTable.error,
      })
      .from(ScheduledRunTable)
      .innerJoin(
        ScheduledJobTable,
        eq(ScheduledRunTable.scheduledJobId, ScheduledJobTable.id),
      )
      .where(
        and(
          eq(ScheduledRunTable.scheduledJobId, jobId),
          eq(ScheduledJobTable.userId, userId),
        ),
      )
      .orderBy(sql`${ScheduledRunTable.startedAt} DESC`)
      .limit(limit)) as ScheduledRun[];
  },
};
