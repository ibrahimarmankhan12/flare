import "server-only";

import { randomUUID } from "node:crypto";

import { BASE_URL, getBaseUrl } from "lib/const";
import { schedulerRepository } from "lib/db/pg/repositories/scheduler-repository.pg";
import { chatRepository } from "lib/db/repository";
import logger from "logger";

import { computeNextRun } from "./cron-parser";
import { acquireLeaderLock, releaseLeaderLock } from "./leader";

// ---------------------------------------------------------------------------
// P3.1 — #11 scheduled agents. The scheduler tick.
//
// One invocation:
//   1. Acquire a short-TTL leader lock against the shared cache so only
//      one worker (Vercel cron OR the standalone worker) actually runs at
//      a time. The TTL of 50s covers a 60s tick interval with slack for
//      network / clock drift. If we don't get the lock we silently no-op
//      (we're not the leader this tick).
//   2. Claim up to 10 due jobs from `scheduled_job`.
//   3. For each claim: create a run record, then synthesize a chat
//      request body and POST it to /api/chat. The chat API authenticates
//      against a user session, so a standalone worker that doesn't carry
//      cookies will see 401. The run is marked failed in that case — the
//      thread + user message are still recorded so the user can see the
//      trigger happened. (Reusing the chat pipeline end-to-end requires a
//      server-to-server auth path that is out of P3.1's scope; see the
//      risk note in context.md.)
//   4. Compute the next-run timestamp from the job's cron and persist it
//      alongside `last_run_at`.
// ---------------------------------------------------------------------------

const LEADER_KEY = "cron-tick-leader";
const LEADER_TTL_MS = 50_000;
const CLAIM_BATCH = 10;

const getOwnerTag = (): string => {
  return `pid-${process.pid}-${Date.now()}`;
};

const buildChatBody = (params: {
  threadId: string;
  agentId: string | null;
  triggerMessage: string;
  chatModel?: { provider: string; model: string } | null;
}) => {
  const messageId = randomUUID();
  const now = Date.now();
  return {
    id: params.threadId,
    message: {
      id: messageId,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: params.triggerMessage,
        },
      ],
      metadata: {
        createdAt: now,
      },
    },
    chatModel: params.chatModel ?? undefined,
    toolChoice: "auto" as const,
    mentions: params.agentId
      ? [
          {
            type: "agent" as const,
            agentId: params.agentId,
            name: "Scheduled Agent",
          },
        ]
      : [],
    allowedAppDefaultToolkit: [],
  };
};

const buildChatHeaders = (userId: string): Record<string, string> => {
  const secret =
    process.env.SCHEDULER_INTERNAL_SECRET || process.env.CRON_SECRET;
  return {
    "Content-Type": "application/json",
    "x-scheduler-source": "cron-tick",
    "x-scheduler-user-id": userId,
    ...(secret ? { "x-scheduler-secret": secret } : {}),
  };
};

const buildChatUrl = (): string => {
  const base = (BASE_URL || getBaseUrl() || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}/api/chat`;
};

export interface SchedulerTickResult {
  claimed: number;
  ran: number;
  failed: number;
  skippedAsNotLeader: boolean;
}

export const runSchedulerTick = async (): Promise<SchedulerTickResult> => {
  const owner = getOwnerTag();
  const acquired = await acquireLeaderLock(LEADER_KEY, LEADER_TTL_MS, owner);
  if (!acquired) {
    logger.debug(
      `[scheduler] tick skipped — another worker holds the leader lock`,
    );
    return { claimed: 0, ran: 0, failed: 0, skippedAsNotLeader: true };
  }

  const result: SchedulerTickResult = {
    claimed: 0,
    ran: 0,
    failed: 0,
    skippedAsNotLeader: false,
  };

  try {
    const dueJobs = await schedulerRepository.claimDueScheduledJobs(
      new Date(),
      CLAIM_BATCH,
    );
    result.claimed = dueJobs.length;
    if (dueJobs.length === 0) {
      return result;
    }

    const chatUrl = buildChatUrl();

    for (const job of dueJobs) {
      const now = new Date();
      const triggerMessage =
        typeof job.payload?.triggerMessage === "string" &&
        job.payload.triggerMessage.length > 0
          ? job.payload.triggerMessage
          : `Scheduled run for ${job.name}`;

      // The chat API normally inserts the thread; we mirror that step here
      // so that even when the /api/chat call fails (no user session) the
      // trigger is visible in the thread list.
      const threadId = randomUUID();
      try {
        await chatRepository.insertThread({
          id: threadId,
          title: `Scheduled: ${job.name}`,
          userId: job.userId,
        });
      } catch (err) {
        logger.error(
          `[scheduler] failed to insert thread for job ${job.id}:`,
          err,
        );
      }

      const run = await schedulerRepository.createScheduledRun(job.id);

      try {
        const chatModel = await chatRepository.selectLatestChatModelByUserId(
          job.userId,
        );
        const body = buildChatBody({
          threadId,
          agentId: job.agentId ?? null,
          triggerMessage,
          chatModel,
        });
        const response = await fetch(chatUrl, {
          method: "POST",
          headers: buildChatHeaders(job.userId),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          await schedulerRepository.updateScheduledRun(run.id, {
            status: "failed",
            completedAt: new Date(),
            error: `chat-api-${response.status}: ${errorText.slice(0, 500)}`,
          });
          result.failed += 1;
        } else {
          await schedulerRepository.updateScheduledRun(run.id, {
            status: "completed",
            completedAt: new Date(),
            output: {
              threadId,
              chatStatus: response.status,
            },
          });
          result.ran += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[scheduler] run for job ${job.id} threw:`, err);
        await schedulerRepository.updateScheduledRun(run.id, {
          status: "failed",
          completedAt: new Date(),
          error: message.slice(0, 1000),
        });
        result.failed += 1;
      }

      // Roll the job forward: one-shot jobs disable themselves after the
      // first run so the next tick won't pick them up again. Recurring
      // jobs advance `next_run_at` to the next cron fire.
      try {
        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const isOnce = payload.scheduleType === "once";
        if (isOnce) {
          await schedulerRepository.updateScheduledJob(job.id, job.userId, {
            lastRunAt: now,
            nextRunAt: new Date(Date.now() + 365 * 24 * 60 * 60_000),
            status: "disabled",
          });
        } else {
          const nextRun = computeNextRun(job.cron, now);
          await schedulerRepository.updateScheduledJob(job.id, job.userId, {
            lastRunAt: now,
            nextRunAt: nextRun,
          });
        }
      } catch (err) {
        logger.error(
          `[scheduler] failed to roll next_run_at for job ${job.id}:`,
          err,
        );
      }
    }
  } finally {
    await releaseLeaderLock(LEADER_KEY, owner);
  }

  return result;
};
