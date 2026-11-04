#!/usr/bin/env tsx
/**
 * P1.6 — one-off memory backfill script.
 *
 * Walks existing `chat_thread` rows, runs the memory extraction pipeline
 * on each (user, assistant) message pair, and stores the resulting
 * memories. The loop logic lives in `src/lib/ai/memory/backfill.ts`
 * (pure, testable); this file is the I/O wiring + CLI.
 *
 * Idempotency: a thread is skipped if any of its messages already has a
 * row in `user_memory` with `source_message_id` pointing to it.
 *
 * Cost control: `--delay-ms` throttles the LLM calls. The free-tier
 * debounce inside `runMemoryExtraction` is bypassed by passing
 * `userTier = "flare-enterprises"` — this is a one-shot maintenance
 * pass, not a per-message hot path.
 *
 * Usage:
 *   pnpm backfill:memories                          # process every thread
 *   pnpm backfill:memories -- --max-threads 100    # stop after 100 threads
 *   pnpm backfill:memories -- --batch-size 25       # (informational)
 *   pnpm backfill:memories -- --delay-ms 500        # 500ms between LLM calls
 *   pnpm backfill:memories -- --user-id <uuid>      # backfill a single user
 *   pnpm backfill:memories -- --dry-run             # walk the loop, no LLM calls
 */
import "load-env";

import { eq } from "drizzle-orm";
import type { UIMessage } from "ai";

import type { ChatMessage } from "app-types/chat";
import { runMemoryExtraction } from "lib/ai/memory/extract-and-store";
import {
  runBackfill,
  type BackfillDeps,
  type BackfillOptions,
} from "lib/ai/memory/backfill";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  MemoryTable,
  UserTable,
} from "lib/db/pg/schema.pg";
import logger from "logger";

const toUiMessage = (m: ChatMessage): UIMessage => ({
  id: m.id,
  role: m.role,
  parts: m.parts,
});

const main = async () => {
  const argv = process.argv.slice(2);
  const getArg = (key: string, fallback: string): string => {
    const idx = argv.indexOf(key);
    return idx === -1 ? fallback : (argv[idx + 1] ?? fallback);
  };
  const hasFlag = (flag: string) => argv.includes(flag);

  const maxThreadsRaw = hasFlag("--max-threads")
    ? Number.parseInt(getArg("--max-threads", "0"), 10)
    : undefined;
  const maxThreadsPerUserRaw = hasFlag("--max-threads-per-user")
    ? Number.parseInt(getArg("--max-threads-per-user", "0"), 10)
    : undefined;
  const userIdArg = hasFlag("--user-id") ? getArg("--user-id", "") : null;
  const dryRun = hasFlag("--dry-run");

  const options: BackfillOptions = {
    batchSize: Number.parseInt(getArg("--batch-size", "50"), 10),
    delayMs: Number.parseInt(getArg("--delay-ms", "200"), 10),
    userDelayMs: Number.parseInt(getArg("--user-delay-ms", "0"), 10),
    ...(maxThreadsRaw && maxThreadsRaw > 0 ? { maxThreads: maxThreadsRaw } : {}),
    ...(maxThreadsPerUserRaw && maxThreadsPerUserRaw > 0
      ? { maxThreadsPerUser: maxThreadsPerUserRaw }
      : {}),
  };

  console.log(
    `[backfill] options=${JSON.stringify({
      ...options,
      userIdArg,
      dryRun,
    })}`,
  );

  const deps: BackfillDeps = {
    listUserIds: async () => {
      if (userIdArg) {
        return [userIdArg];
      }
      const rows = await pgDb
        .select({ id: UserTable.id })
        .from(UserTable);
      return rows.map((r) => r.id);
    },
    listThreadIdsForUser: async (userId) => {
      const rows = await pgDb
        .select({ id: ChatThreadTable.id })
        .from(ChatThreadTable)
        .where(eq(ChatThreadTable.userId, userId));
      return rows.map((r) => r.id);
    },
    getThreadTitle: async (threadId) => {
      const [row] = await pgDb
        .select({ title: ChatThreadTable.title })
        .from(ChatThreadTable)
        .where(eq(ChatThreadTable.id, threadId));
      return row?.title ?? null;
    },
    getMessagesForThread: async (threadId) => {
      const rows = (await pgDb
        .select()
        .from(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, threadId))
        .orderBy(ChatMessageTable.createdAt)) as ChatMessage[];
      return rows.map(toUiMessage);
    },
    threadHasMemories: async (threadId, _userId) => {
      // Idempotency check: does any message in this thread already have
      // a `user_memory` row with source_message_id = message.id?
      // If yes, the whole thread is treated as already backfilled.
      const rows = await pgDb
        .select({ id: MemoryTable.id })
        .from(MemoryTable)
        .innerJoin(
          ChatMessageTable,
          eq(MemoryTable.sourceMessageId, ChatMessageTable.id),
        )
        .where(eq(ChatMessageTable.threadId, threadId))
        .limit(1);
      return rows.length > 0;
    },
    runExtraction: async ({
      userId,
      threadId,
      threadTitle,
      userMessage,
      assistantMessage,
    }) => {
      if (dryRun) {
        return {
          ran: false,
          reason: "dry-run",
          extracted: 0,
          embedded: 0,
          persisted: 0,
          errors: [],
        };
      }
      // Bypass free-tier debounce — this is a maintenance pass.
      return runMemoryExtraction({
        userId,
        userTier: "flare-enterprises",
        threadId,
        ...(threadTitle ? { threadTitle } : {}),
        userMessage,
        assistantMessage,
      });
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (msg) => console.log(`[backfill] ${msg}`),
    warn: (msg, err) => {
      if (err !== undefined) {
        logger.warn(`[backfill] ${msg}`, err);
      } else {
        logger.warn(`[backfill] ${msg}`);
      }
      console.warn(
        `[backfill] ${msg}`,
        err instanceof Error ? err.message : err,
      );
    },
  };

  const progress = await runBackfill(options, deps);
  console.log("[backfill] summary:", JSON.stringify(progress, null, 2));
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
  });
