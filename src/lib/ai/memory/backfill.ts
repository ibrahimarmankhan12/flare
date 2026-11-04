/**
 * P1.6 — pure backfill loop logic for memories.
 *
 * This module is deliberately side-effect-free. It takes a `BackfillDeps`
 * object that provides all the I/O (DB queries, LLM extraction, sleep,
 * logging) and an options bag that bounds the run. Keeping the loop
 * pure makes it trivially unit-testable: the test file at
 * `backfill.test.ts` exercises the control flow with mocked deps.
 *
 * The actual CLI lives in `scripts/backfill-memories.ts` and wires the
 * real DB + extraction pipeline into this loop.
 */
import type { UIMessage } from "ai";

export interface BackfillMessagePair {
  userMessage: UIMessage;
  assistantMessage: UIMessage;
}

export interface BackfillPairResultSummary {
  ran: boolean;
  reason?: "debounced" | "no-candidates" | "error" | string;
  extracted: number;
  embedded: number;
  persisted: number;
  errorCount: number;
}

export interface BackfillPairLog {
  pairIndex: number;
  summary: BackfillPairResultSummary;
}

export interface BackfillThreadResult {
  threadId: string;
  threadTitle: string;
  pairCount: number;
  skipped: boolean;
  totalExtracted: number;
  totalPersisted: number;
  errors: string[];
  pairLogs: BackfillPairLog[];
}

export interface BackfillProgress {
  totalUsers: number;
  processedUsers: number;
  seenThreads: number;
  processedThreads: number;
  skippedThreads: number;
  errorThreads: number;
  totalPairs: number;
  totalPersisted: number;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  stoppedEarly: boolean;
}

export interface BackfillExtractionResult {
  ran: boolean;
  reason?: "debounced" | "no-candidates" | "error" | string;
  extracted: number;
  embedded: number;
  persisted: number;
  errors: string[];
}

export interface BackfillDeps {
  /** List all user IDs to backfill. */
  listUserIds(): Promise<string[]>;
  /** List thread IDs belonging to a user. */
  listThreadIdsForUser(userId: string): Promise<string[]>;
  /** Read the thread's title (used as context for the extraction prompt). */
  getThreadTitle(threadId: string): Promise<string | null>;
  /** Read all messages in a thread, ordered by createdAt ascending. */
  getMessagesForThread(threadId: string): Promise<UIMessage[]>;
  /**
   * Idempotency check. Return true if the thread already has at least
   * one memory row whose `sourceMessageId` points to a message in this
   * thread. When true, the thread is skipped.
   */
  threadHasMemories(threadId: string, userId: string): Promise<boolean>;
  /** Run the extraction pipeline on a single (user, assistant) pair. */
  runExtraction(input: {
    userId: string;
    threadId: string;
    threadTitle: string;
    userMessage: UIMessage;
    assistantMessage: UIMessage;
  }): Promise<BackfillExtractionResult>;
  /** Sleep helper for rate limiting. */
  sleep(ms: number): Promise<void>;
  /** Info-level logging. */
  log(message: string): void;
  /** Warning-level logging for per-thread / per-pair errors. */
  warn(message: string, err?: unknown): void;
}

export interface BackfillOptions {
  /** Hard cap on threads processed in the whole run. */
  maxThreads?: number;
  /** Informational batch size (the loop processes threads in one go). */
  batchSize?: number;
  /** Delay between runExtraction calls, in milliseconds. */
  delayMs?: number;
  /** Delay between users, in milliseconds. */
  userDelayMs?: number;
  /**
   * If set, return once this many consecutive threads have been
   * processed for a user (for very chatty users). Defaults to no
   * per-user cap.
   */
  maxThreadsPerUser?: number;
}

const ZERO_PROGRESS: Omit<BackfillProgress, "startedAt"> = {
  totalUsers: 0,
  processedUsers: 0,
  seenThreads: 0,
  processedThreads: 0,
  skippedThreads: 0,
  errorThreads: 0,
  totalPairs: 0,
  totalPersisted: 0,
  stoppedEarly: false,
};

/**
 * Pair user messages with their immediate next assistant message. Skips
 * messages that don't form a pair. Exported for unit tests.
 */
export const pairChatMessages = (
  messages: UIMessage[],
): BackfillMessagePair[] => {
  const pairs: BackfillMessagePair[] = [];
  let pendingUser: UIMessage | null = null;
  for (const m of messages) {
    if (m.role === "user") {
      // Replace any earlier pending user message — only the most
      // recent user message before the assistant reply matters.
      pendingUser = m;
    } else if (m.role === "assistant" && pendingUser) {
      pairs.push({ userMessage: pendingUser, assistantMessage: m });
      pendingUser = null;
    }
    // system/tool messages are ignored for memory extraction.
  }
  return pairs;
};

const summarizePair = (
  result: BackfillExtractionResult,
): BackfillPairResultSummary => ({
  ran: result.ran,
  reason: result.reason,
  extracted: result.extracted,
  embedded: result.embedded,
  persisted: result.persisted,
  errorCount: result.errors.length,
});

/**
 * Run the backfill loop. Walks every user, every thread, and every
 * (user, assistant) pair, calling `runExtraction` for each pair. Errors
 * in one thread or pair are logged and the loop continues.
 *
 * @param options  Bounds the run (maxThreads, delays, etc.).
 * @param deps     I/O dependencies (DB, LLM extraction, sleep, logging).
 */
export const runBackfill = async (
  options: BackfillOptions,
  deps: BackfillDeps,
): Promise<BackfillProgress> => {
  const maxThreads = options.maxThreads ?? Number.POSITIVE_INFINITY;
  const batchSize = options.batchSize ?? 50;
  const delayMs = options.delayMs ?? 200;
  const userDelayMs = options.userDelayMs ?? 0;
  const maxThreadsPerUser = options.maxThreadsPerUser ?? Number.POSITIVE_INFINITY;

  const progress: BackfillProgress = {
    ...ZERO_PROGRESS,
    startedAt: Date.now(),
  };

  const userIds = await deps.listUserIds();
  progress.totalUsers = userIds.length;
  deps.log(
    `Backfill starting. users=${userIds.length} maxThreads=${maxThreads} batchSize=${batchSize} delayMs=${delayMs}`,
  );

  for (const userId of userIds) {
    if (progress.seenThreads >= maxThreads) {
      progress.stoppedEarly = true;
      deps.log(`Reached maxThreads=${maxThreads}; stopping.`);
      break;
    }
    progress.processedUsers += 1;

    let userThreadCount = 0;
    try {
      const threadIds = await deps.listThreadIdsForUser(userId);
      deps.log(`[user ${userId}] threads=${threadIds.length}`);

      for (const threadId of threadIds) {
        if (progress.seenThreads >= maxThreads) {
          progress.stoppedEarly = true;
          deps.log(`Reached maxThreads=${maxThreads}; stopping.`);
          break;
        }
        if (userThreadCount >= maxThreadsPerUser) {
          deps.log(
            `[user ${userId}] reached maxThreadsPerUser=${maxThreadsPerUser}; moving to next user.`,
          );
          break;
        }
        progress.seenThreads += 1;
        userThreadCount += 1;

        try {
          const already = await deps.threadHasMemories(threadId, userId);
          if (already) {
            progress.skippedThreads += 1;
            deps.log(`[thread ${threadId}] already has memories; skipping.`);
            continue;
          }

          const [messages, threadTitle] = await Promise.all([
            deps.getMessagesForThread(threadId),
            deps.getThreadTitle(threadId),
          ]);

          const pairs = pairChatMessages(messages);
          if (pairs.length === 0) {
            deps.log(
              `[thread ${threadId}] no (user, assistant) pairs; skipping.`,
            );
            continue;
          }

          const result: BackfillThreadResult = {
            threadId,
            threadTitle: threadTitle ?? "",
            pairCount: pairs.length,
            skipped: false,
            totalExtracted: 0,
            totalPersisted: 0,
            errors: [],
            pairLogs: [],
          };

          for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i]!;
            try {
              const r = await deps.runExtraction({
                userId,
                threadId,
                threadTitle: result.threadTitle,
                userMessage: pair.userMessage,
                assistantMessage: pair.assistantMessage,
              });
              const summary = summarizePair(r);
              result.pairLogs.push({ pairIndex: i, summary });
              result.totalExtracted += r.extracted;
              result.totalPersisted += r.persisted;
              result.errors.push(...r.errors);
              if (r.errors.length > 0) {
                deps.warn(
                  `[thread ${threadId}] pair ${i} had ${r.errors.length} errors`,
                );
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              result.errors.push(`pair ${i}: ${msg}`);
              deps.warn(`[thread ${threadId}] pair ${i} failed`, err);
            }

            if (i < pairs.length - 1 && delayMs > 0) {
              await deps.sleep(delayMs);
            }
          }

          progress.processedThreads += 1;
          progress.totalPairs += result.pairCount;
          progress.totalPersisted += result.totalPersisted;
          deps.log(
            `[thread ${threadId}] pairs=${result.pairCount} persisted=${result.totalPersisted} errors=${result.errors.length}`,
          );
        } catch (err) {
          progress.errorThreads += 1;
          deps.warn(`[thread ${threadId}] failed`, err);
        }
      }
    } catch (err) {
      deps.warn(`[user ${userId}] failed`, err);
    }

    if (userDelayMs > 0 && progress.processedUsers < userIds.length) {
      await deps.sleep(userDelayMs);
    }
  }

  progress.finishedAt = Date.now();
  progress.durationMs = progress.finishedAt - progress.startedAt;
  deps.log(
    `Backfill done. users=${progress.processedUsers}/${progress.totalUsers} threads seen=${progress.seenThreads} processed=${progress.processedThreads} skipped=${progress.skippedThreads} errors=${progress.errorThreads} pairs=${progress.totalPairs} persisted=${progress.totalPersisted} durationMs=${progress.durationMs} stoppedEarly=${progress.stoppedEarly}`,
  );
  return progress;
};
