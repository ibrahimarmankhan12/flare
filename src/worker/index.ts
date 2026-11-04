// P3.1 — #11 scheduled agents. Standalone worker entry. Run on Railway,
// Render, Fly, EC2, anywhere that can keep a Node process alive. The
// worker shares the same Postgres DB and the same `serverCache` (Redis
// or Upstash) as the Next.js app — the leader lock prevents both the
// Vercel cron tick AND this worker from processing the same jobs.
//
// Run with: `pnpm tsx src/worker/index.ts` (or compiled via tsc / esbuild).
//
// Env loading: this entry runs outside Next.js, so we load .env via the
// same helper the rest of the scripts use (`load-env`). The tick itself
// uses only `process.env`, so the helper just needs to populate env
// before the first DB / cache call.

import "load-env";

import { runSchedulerTick } from "lib/scheduler";
import { runOutboxTick } from "lib/scheduler/outbox-worker";
import { isE2BConfigured } from "lib/sandbox/client";
import { reapSandboxes } from "lib/sandbox/runner";
import logger from "logger";

const TICK_INTERVAL_MS = 60_000;

const log = logger.withTag("worker");
const startedAt = Date.now();
log.info(
  `[worker] starting standalone scheduler loop, pid=${process.pid}, tick=${TICK_INTERVAL_MS}ms`,
);

let stopping = false;
let interval: NodeJS.Timeout | null = null;

const runOneTick = async () => {
  try {
    const result = await runSchedulerTick();
    if (result.skippedAsNotLeader) {
      log.debug(`[worker] tick skipped (not leader)`);
    } else if (result.claimed > 0) {
      log.info(
        `[worker] tick: claimed=${result.claimed} ran=${result.ran} failed=${result.failed}`,
      );
    }
  } catch (err) {
    log.error(`[worker] tick threw:`, err);
  }

  // P3.4 — webhook outbox. `runOutboxTick` had no caller anywhere (the
  // route never wired it up), so enqueued events sat in the outbox
  // forever. Drain it on the same cadence as the scheduler tick; it has
  // its own leader lock and claim limit.
  try {
    const outbox = await runOutboxTick();
    if (outbox.claimed > 0) {
      log.info(
        `[worker] outbox: claimed=${outbox.claimed} delivered=${outbox.delivered} failed=${outbox.failed}`,
      );
    }
  } catch (err) {
    log.error(`[worker] outbox tick threw:`, err);
  }

  // E2B sandbox cleanup. Running sandboxes bill per second, so anything that
  // outlives its lease — or that no build row references at all — is money
  // burning with nobody watching. Paused sandboxes are free and left alone.
  if (isE2BConfigured()) {
    try {
      const reaped = await reapSandboxes();
      if (reaped.expiredKilled || reaped.orphansKilled) {
        log.info(
          `[worker] sandboxes reaped: expired=${reaped.expiredKilled} orphans=${reaped.orphansKilled}`,
        );
      }
    } catch (err) {
      log.error(`[worker] sandbox reap threw:`, err);
    }
  }
};

const shutdown = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log.info(
    `[worker] received ${signal} — shutting down (uptime=${Math.round((Date.now() - startedAt) / 1000)}s)`,
  );
  if (interval) clearInterval(interval);
  // Give the in-flight tick a moment to finish; exit hard after 5s.
  setTimeout(() => process.exit(0), 5_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  log.error(`[worker] uncaughtException:`, err);
});
process.on("unhandledRejection", (reason) => {
  log.error(`[worker] unhandledRejection:`, reason);
});

void runOneTick();
interval = setInterval(() => {
  void runOneTick();
}, TICK_INTERVAL_MS);
