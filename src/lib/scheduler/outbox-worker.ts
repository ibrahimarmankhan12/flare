import "server-only";

// ---------------------------------------------------------------------------
// P3.4 — Webhook outbox worker
// ---------------------------------------------------------------------------
// One tick of the worker does the following:
//
//   1. Try to acquire a short-lived leader lock (`outbox-tick-leader`).
//      If we lose the race, return early — the other worker instance
//      (or Vercel cron replica) is already running this tick. The
//      leader election is owned by P3.1 (`src/lib/scheduler/leader.ts`).
//
//   2. Claim up to 25 due events from `webhook_event_outbox`.
//
//   3. For each event, look up the user's subscriptions that subscribe
//      to the event's `event_type` (the repository's `listWebhookSubscriptions`
//      handles the allowlist / wildcard logic). For each subscription,
//      create a `webhook_delivery` row, sign + POST the payload, and
//      mark the delivery delivered or failed.
//
//   4. After every subscription has been processed, the event itself
//      is marked `delivered` (if at least one delivery row exists and
//      they all succeeded), `failed` (if the per-event attempt cap
//      is reached), or `pending` with a backoff `next_attempt_at`
//      (for transient failures).
//
//   5. The leader lock is always released, even on exception.
//
// `runOutboxTickForRoute` is a thin wrapper kept for symmetry with
// future route handlers (e.g. `/api/cron/outbox-tick`).
// ---------------------------------------------------------------------------

import { hostname } from "node:os";
import { webhookRepository } from "lib/db/repository";
import { computeBackoffMs, deliverWebhook, signPayload } from "lib/webhooks";
import { acquireLeaderLock, releaseLeaderLock } from "./leader";

const LOCK_NAME = "outbox-tick-leader";
const LOCK_TTL_MS = 50_000;
const CLAIM_LIMIT = 25;
const DELIVERY_TIMEOUT_MS = 10_000;

interface RunOutboxTickResult {
  claimed: number;
  delivered: number;
  failed: number;
  retried: number;
  skippedAsNotLeader: boolean;
}

export const runOutboxTick = async (): Promise<RunOutboxTickResult> => {
  const owner = `${hostname()}-${process.pid}`;
  const acquired = await acquireLeaderLock(LOCK_NAME, LOCK_TTL_MS, owner);
  if (!acquired) {
    return {
      claimed: 0,
      delivered: 0,
      failed: 0,
      retried: 0,
      skippedAsNotLeader: true,
    };
  }

  let claimed = 0;
  let delivered = 0;
  let failed = 0;
  let retried = 0;

  try {
    const events = await webhookRepository.claimPendingOutboxEvents(
      new Date(),
      CLAIM_LIMIT,
    );
    claimed = events.length;

    for (const event of events) {
      const { userId } = extractUserId(event.payload);
      if (!userId) {
        // Malformed event — no userId in the payload. Mark failed
        // permanently (no retries) so it does not block the queue.
        await webhookRepository.markOutboxEventFailed(
          event.id,
          "payload missing userId",
          event.nextAttemptAt,
        );
        failed += 1;
        continue;
      }

      const subscriptions = await webhookRepository.listWebhookSubscriptions(
        userId,
        event.eventType,
      );

      // No subscribers: count the event as delivered (nothing to do).
      // We still bump the event status so the outbox does not loop on
      // events nobody cares about.
      if (subscriptions.length === 0) {
        await webhookRepository.markOutboxEventDelivered(event.id);
        delivered += 1;
        continue;
      }

      let anyFailed = false;
      let anySucceeded = false;

      for (const subscription of subscriptions) {
        if (!subscription.enabled) continue;

        // Read the plaintext signing secret. NULL means legacy
        // subscription without a provisioned secret — skip it.
        const signingSecret =
          await webhookRepository.getWebhookSubscriptionSigningSecret(
            subscription.id,
            subscription.userId,
          );
        if (!signingSecret) continue;

        const payload = JSON.stringify({
          id: event.id,
          type: event.eventType,
          createdAt: event.createdAt.toISOString(),
          data: event.payload,
        });

        const { signature, timestamp } = signPayload(payload, signingSecret);

        const delivery = await webhookRepository.createWebhookDelivery({
          eventId: event.id,
          subscriptionId: subscription.id,
        });

        const result = await deliverWebhook({
          url: subscription.url,
          payload,
          signature,
          timestamp,
          timeoutMs: DELIVERY_TIMEOUT_MS,
        });

        if (result.ok) {
          await webhookRepository.markWebhookDeliveryDelivered(delivery.id);
          anySucceeded = true;
        } else {
          const reason = result.status
            ? `HTTP ${result.status} ${result.error ?? ""}`.trim()
            : (result.error ?? "unknown error");
          await webhookRepository.markWebhookDeliveryFailed(
            delivery.id,
            reason,
          );
          anyFailed = true;
        }
      }

      if (anyFailed && !anySucceeded) {
        const nextAttempt = event.attempts + 1;
        if (nextAttempt >= event.maxAttempts) {
          await webhookRepository.markOutboxEventFailed(
            event.id,
            `exceeded max attempts (${event.maxAttempts})`,
            event.nextAttemptAt,
          );
          failed += 1;
        } else {
          const backoff = computeBackoffMs(nextAttempt);
          await webhookRepository.markOutboxEventFailed(
            event.id,
            "delivery failed",
            new Date(Date.now() + backoff),
          );
          retried += 1;
        }
      } else {
        // Either all deliveries succeeded, or some succeeded and some
        // failed: count the event as delivered. The delivery rows
        // record per-subscriber status independently.
        await webhookRepository.markOutboxEventDelivered(event.id);
        delivered += 1;
      }
    }
  } finally {
    await releaseLeaderLock(LOCK_NAME, owner);
  }

  return {
    claimed,
    delivered,
    failed,
    retried,
    skippedAsNotLeader: false,
  };
};

export const runOutboxTickForRoute = async (): Promise<RunOutboxTickResult> =>
  runOutboxTick();

const extractUserId = (
  payload: Record<string, unknown>,
): { userId: string | null } => {
  const raw = payload.userId;
  if (typeof raw === "string" && raw.length > 0) {
    return { userId: raw };
  }
  return { userId: null };
};
