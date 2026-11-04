# Webhook subscriptions

Webhook subscriptions let external services receive a push notification
when something happens in a user's Flare account — a thread is created,
a message is posted, a scheduled agent run completes, an agent is
published, or an inbound trigger fires. Each subscription is a URL +
event-type list + signing secret. The outbox worker delivers events with
exponential backoff and HMAC-signed payloads.

## What events exist

Phase 3 supports five event types, all written to the shared
`webhook_event_outbox` table by the relevant code path.

| Event                       | Fired when                                             |
| --------------------------- | ------------------------------------------------------ |
| `thread.created`            | A new thread is created (REST, UI, scheduled tick)     |
| `message.created`           | A message is inserted (REST, chat route)               |
| `scheduled_run.completed`   | A scheduled agent run finishes (success or failure)    |
| `agent.published`           | An agent is published to the marketplace (Phase 4)     |
| `inbound.received`          | An inbound trigger lands and is enqueued               |

`inbound.received` is the same outbox row the worker drains to run the
agent — but subscribers can also listen for it independently (e.g. to
mirror inbound traffic into their own audit log).

## How to subscribe

Phase 3 ships the data layer and the delivery path; the public API for
creating subscriptions is a Phase 5 follow-up. Today you create a row
directly via the repository:

```
webhookRepository.createWebhookSubscription({
  userId: "<user>",
  url: "https://example.com/hooks/flare",
  eventTypes: ["thread.created", "message.created"],
  signingSecret: "whsec_<at-least-32-chars>",  // plaintext, see Risks
  description: "Prod mirror",
  enabled: true,
})
```

A future P3.4 dashboard route (or a `/api/v1/webhooks` REST surface) will
wrap this with a one-time-secret reveal, much like `/api/api-key`.

## Signature header format

Every delivery carries:

```
X-Webhook-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
```

`v1` is the hex-encoded HMAC-SHA-256 of `${timestamp}.${body}` using the
subscription's `signingSecret`. This is the same shape Stripe and GitHub
use, so most off-the-shelf signature-verification libraries will parse
it with a small adapter. The convention is stable across the `v1`
prefix — future `v2` schemes will roll out non-breaking.

## Verifying a delivery on the receiver

A minimal verifier looks like:

```
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(headers, body, secret) {
  const header = headers["x-webhook-signature"];
  if (!header) throw new Error("missing signature");

  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.trim().split("=", 2))
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) throw new Error("malformed header");

  // Replay protection: reject anything older than 5 minutes.
  const ageSec = Math.abs(Date.now() / 1000 - t);
  if (ageSec > 5 * 60) throw new Error("stale signature");

  const expected = createHmac("sha256", secret)
    .update(`${t}.${body}`, "utf8")
    .digest("hex");

  // constant-time compare on equal-length hex strings
  if (v1.length !== expected.length) throw new Error("bad signature");
  const a = Buffer.from(v1, "hex");
  const b = Buffer.from(expected, "hex");
  if (!timingSafeEqual(a, b)) throw new Error("bad signature");
}
```

The `lib/webhooks/sign.ts` `verifySignature` helper does this for you if
you want to embed it in a Node receiver. The 5-minute freshness window
matches the constant in `SIGNATURE_TOLERANCE_SECONDS`.

## Delivery semantics

The outbox worker (`src/lib/scheduler/outbox-worker.ts`, called by
`runOutboxTick`) is the single delivery point for every kind of outbox
event — webhook subscriptions, inbound triggers, and future sources all
share the same table and the same tick function.

The tick per event:

1. **Claim.** `webhookRepository.claimPendingOutboxEvents(now, 25)` reads
   up to 25 events whose `status='pending' AND next_attempt_at <= now`.
2. **Match.** For each event, `listWebhookSubscriptions(userId, eventType)`
   returns subscriptions whose `eventTypes` array contains the event type
   (or is empty = wildcard).
3. **Sign + POST.** For each subscription,
   `getWebhookSubscriptionSigningSecret(id, userId)` fetches the plaintext
   secret, then `deliverWebhook({url, payload, signingSecret})` performs
   the `POST` with `Content-Type: application/json`,
   `User-Agent: flare-webhooks/1`, the signature header, and a 10-second
   `AbortController` timeout.
4. **Record deliveries.** A `webhook_delivery` row per (event, subscription)
   is inserted with `status='delivered'` on 2xx, `status='failed'` on
   4xx / 5xx / network errors. The error message is captured in
   `last_error`.
5. **Aggregate the event.** If all deliveries succeeded, the event is
   marked `delivered`. If any failed and `attempts < max_attempts`, the
   event is rescheduled with `computeBackoffMs(attempts)`; if
   `attempts >= max_attempts`, it is marked `failed`. Events with zero
   matching subscriptions are marked `delivered` (nothing to do).
6. **Backoff.** `computeBackoffMs` returns `2^attempt * 1000ms` with
   ±20% jitter, capped at 1 hour. Attempt 0 → ~1s; attempt 5 → ~32s;
   attempt 12+ → ~1h ± 20%.

The default `max_attempts` is 5 (per the schema default). After the 5th
failed delivery the event is terminal.

## Limits and risks

- **`signing_secret` is stored as plaintext.** This is a known Phase 3
  limitation. The worker needs the plaintext to sign outgoing payloads,
  and adding KMS-backed decryption is out of scope for this round. The
  schema column and the repository method's JSDoc both flag this
  explicitly. Recommended Phase 5 hardening: encrypt at rest with a
  KMS-managed key, or store the secret in AWS Secrets Manager / Vault
  and reference by ARN.
- **No public API to create subscriptions yet.** The data layer and the
  worker are in place; a dashboard route is a Phase 5 follow-up.
- **Multi-replica duplicate processing is possible** in a worst case.
  `claimPendingOutboxEvents` is non-mutating (P3.0 design); the leader
  lock prevents concurrent ticks within one deployment, but Vercel cron
  + a standalone worker can both attempt the same event. Subscribers
  should be idempotent on `eventId` regardless. A
  `FOR UPDATE SKIP LOCKED` follow-up is on the Phase 5 hardening list.
- **Pre-0024 subscriptions have `signing_secret = NULL`.** The worker
  treats NULL as "skip" — these rows silently drop their events. They
  must be re-provisioned (or backfilled) before delivery can succeed.
  The trade-off is deliberate: it lets the worker keep running while the
  migration is in flight.
- **No dead-letter UI.** Failed events stay in the `webhook_event_outbox`
  table with `status='failed'`. A small admin view that lists and
  re-enqueues them is a Phase 5 follow-up.
- **No per-subscription rate limits yet.** A misbehaving subscriber can
  soak up worker time. Per-subscription throttling is on the Phase 5
  hardening list.

## See also

- `src/lib/webhooks/sign.ts` — `signPayload`, `verifySignature`,
  `formatSignatureHeader`
- `src/lib/webhooks/deliver.ts` — `deliverWebhook`, `computeBackoffMs`
- `src/lib/webhooks/index.ts` — public surface (re-exports)
- `src/lib/scheduler/outbox-worker.ts` — `runOutboxTick`
- `src/lib/db/pg/repositories/webhook-repository.pg.ts` — data layer
  (including `enqueueOutboxEvent`, `claimPendingOutboxEvents`,
  `getWebhookSubscriptionSigningSecret`)
- `src/lib/db/migrations/pg/0024_webhook_signing_secret.sql` — the
  `signing_secret` column
