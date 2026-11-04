import "server-only";
import { colorize } from "consola/utils";
import { and, asc, isNull, lt } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatThreadTable } from "lib/db/pg/schema.pg";
import { chatRepository } from "lib/db/repository";
import logger from "logger";
import { generateThreadInsights } from "./insights";

const insightsLogger = logger.withDefaults({
  message: colorize("blackBright", "Insights backfill: "),
});

/**
 * P2.4 follow-up — pre-populate insights for stale threads.
 *
 * Picks threads that have never had insights generated AND are at
 * least `olderThanMinutes` old (default 5 — gives the user time to
 * finish a stream of messages instead of generating insights on
 * every single new turn).
 *
 * "Stale re-generation" (insights exist but a new message was added
 * since) is intentionally out of scope for this first pass — a
 * future iteration can compare `insightsGeneratedAt` against the
 * latest `chat_message.createdAt` for the same thread. We avoid
 * `chat_thread.updatedAt` because the column does not exist on
 * the current schema and adding it would touch the repository
 * surface beyond this module.
 *
 * For each candidate, fetches the full message transcript and runs
 * `generateThreadInsights` (the LLM pass). Threads with fewer than
 * `minMessages` messages (default 3) are skipped — not enough
 * signal. Threads that error during generation are recorded in the
 * result but do not abort the batch.
 *
 * Returns a tally so the caller (the scheduler tick) can log it.
 *
 * Limits: `maxThreads` caps the batch so a single tick cannot blow
 * through the LLM budget. The scheduler calls this with a small
 * limit (e.g. 5-10) and ticks every minute, so over time the whole
 * queue drains without one tick paying for everything.
 */
export type BackfillInsightsResult = {
  considered: number;
  generated: number;
  failed: number;
  skippedFewMessages: number;
};

export type BackfillInsightsOptions = {
  olderThanMinutes?: number;
  minMessages?: number;
  maxThreads?: number;
};

const DEFAULT_OLDER_THAN_MINUTES = 5 as const;
const DEFAULT_MIN_MESSAGES = 3 as const;
const DEFAULT_MAX_THREADS = 25 as const;

export const backfillThreadInsights = async (
  options?: BackfillInsightsOptions,
): Promise<BackfillInsightsResult> => {
  const olderThanMinutes =
    options?.olderThanMinutes ?? DEFAULT_OLDER_THAN_MINUTES;
  const minMessages = options?.minMessages ?? DEFAULT_MIN_MESSAGES;
  const maxThreads = options?.maxThreads ?? DEFAULT_MAX_THREADS;

  if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < 0) {
    throw new Error(
      `backfillThreadInsights: olderThanMinutes must be >= 0, got ${olderThanMinutes}`,
    );
  }
  if (!Number.isFinite(minMessages) || minMessages < 1) {
    throw new Error(
      `backfillThreadInsights: minMessages must be >= 1, got ${minMessages}`,
    );
  }
  if (!Number.isFinite(maxThreads) || maxThreads <= 0) {
    throw new Error(
      `backfillThreadInsights: maxThreads must be > 0, got ${maxThreads}`,
    );
  }

  // 1. Candidate selection: threads with no insights yet that are
  //    at least `olderThanMinutes` old. The age guard prevents
  //    generating insights mid-stream on a fresh thread.
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const candidateRows = await db
    .select({
      id: ChatThreadTable.id,
      userId: ChatThreadTable.userId,
    })
    .from(ChatThreadTable)
    .where(
      and(
        lt(ChatThreadTable.createdAt, cutoff),
        isNull(ChatThreadTable.insightsGeneratedAt),
      ),
    )
    .orderBy(asc(ChatThreadTable.createdAt))
    .limit(maxThreads);

  if (candidateRows.length === 0) {
    return {
      considered: 0,
      generated: 0,
      failed: 0,
      skippedFewMessages: 0,
    };
  }

  let generated = 0;
  let failed = 0;
  let skippedFewMessages = 0;

  // 2. Per-thread generation. We process candidates serially so a
  //    single stuck thread cannot eat the LLM budget for the whole
  //    batch. (For high-throughput cases, a future pass can fan
  //    these out to a worker pool with a per-thread timeout.)
  for (const row of candidateRows) {
    try {
      const messages = await chatRepository.selectMessagesByThreadId(row.id);

      // Skip threads with too few messages — there's nothing
      // meaningful to summarise and the LLM would just
      // hallucinate.
      const qualifyingMessages = messages.filter(
        (m) => m.role === "user" || m.role === "assistant",
      );
      if (qualifyingMessages.length < minMessages) {
        skippedFewMessages += 1;
        continue;
      }

      const insights = await generateThreadInsights({
        messages: qualifyingMessages,
      });

      const updated = await chatRepository.updateThreadInsights(
        row.id,
        row.userId,
        insights,
      );
      if (!updated) {
        // The thread was deleted between candidate selection and
        // generation. Not an error — just skip.
        skippedFewMessages += 1;
        continue;
      }
      generated += 1;
    } catch (err) {
      failed += 1;
      insightsLogger.error(
        `failed to backfill insights for thread ${row.id}:`,
        err,
      );
    }
  }

  insightsLogger.info(
    `backfill summary: considered=${candidateRows.length} generated=${generated} failed=${failed} skipped=${skippedFewMessages}`,
  );

  return {
    considered: candidateRows.length,
    generated,
    failed,
    skippedFewMessages,
  };
};
