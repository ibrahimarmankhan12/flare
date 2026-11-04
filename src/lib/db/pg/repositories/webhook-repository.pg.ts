import "server-only";

import { and, desc, eq, lte, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  NewWebhookDelivery,
  NewWebhookEventOutbox,
  NewWebhookSubscription,
  WebhookDelivery,
  WebhookDeliveryTable,
  WebhookEventOutbox,
  WebhookEventOutboxTable,
  WebhookSubscription,
  WebhookSubscriptionTable,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P3.0 schema foundation — webhook repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `webhook_subscription`, `webhook_event_outbox`, and
// `webhook_delivery` tables. The actual HMAC signing, exponential
// backoff, and HTTP fan-out live in P3.4 (src/lib/webhooks/{sign,deliver}.ts).
// This file is the data-access layer:
//   * Subscriptions: standard owner-scoped CRUD. Subscriptions are
//     matched against events by intersecting `eventTypes` with the
//     event's `event_type` (the fan-out happens in P3.4).
//   * Outbox: enqueue + atomic claim. The claim uses the same pattern
//     as `claimDueScheduledJobs` — selects rows whose status='pending'
//     and `next_attempt_at <= now`.
//   * Deliveries: one row per (event, subscriber) — the fan-out
//     materialization is in P3.4. The worker's per-attempt mutations
//     are split into Delivered / Failed helpers for clarity.
// ---------------------------------------------------------------------------

export interface CreateWebhookSubscriptionInput {
  url: string;
  eventTypes?: string[];
  secretHash: string;
  /**
   * P3.4 — plaintext signing secret used by the outbox worker. NULL
   * for legacy subscriptions; the worker will skip them. Encrypt-at-rest
   * is deferred to a Phase 4+ hardening pass.
   */
  signingSecret?: string | null;
  description?: string | null;
  enabled?: boolean;
}

export interface UpdateWebhookSubscriptionInput {
  url?: string;
  eventTypes?: string[];
  secretHash?: string;
  /**
   * P3.4 — see `CreateWebhookSubscriptionInput.signingSecret` for the
   * plaintext-storage caveat.
   */
  signingSecret?: string | null;
  description?: string | null;
  enabled?: boolean;
}

export interface UpdateWebhookSubscriptionStatsPatch {
  failureCount?: number;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
  lastFailureReason?: string | null;
}

export interface EnqueueOutboxEventInput {
  kind: "inbound" | "outbound";
  eventType: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  nextAttemptAt?: Date;
}

export interface CreateWebhookDeliveryInput {
  eventId: string;
  subscriptionId: string;
}

export interface WebhookDeliveryWithEvent {
  delivery: WebhookDelivery;
  event: WebhookEventOutbox;
}

export const webhookRepository = {
  // ---- subscriptions ------------------------------------------------------

  async createWebhookSubscription(
    input: CreateWebhookSubscriptionInput,
    userId: string,
  ): Promise<WebhookSubscription> {
    const [row] = await db
      .insert(WebhookSubscriptionTable)
      .values({
        userId,
        url: input.url,
        eventTypes: input.eventTypes ?? [],
        secretHash: input.secretHash,
        signingSecret: input.signingSecret ?? null,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
      } satisfies NewWebhookSubscription)
      .returning();
    return row as WebhookSubscription;
  },

  /**
   * List a user's subscriptions. If `eventType` is given, filter to
   * those that subscribe to that type — i.e. `eventTypes` contains the
   * value OR is empty (the latter means "subscribe to everything").
   */
  async listWebhookSubscriptions(
    userId: string,
    eventType?: string,
  ): Promise<WebhookSubscription[]> {
    if (!eventType) {
      return (await db
        .select()
        .from(WebhookSubscriptionTable)
        .where(eq(WebhookSubscriptionTable.userId, userId))
        .orderBy(
          desc(WebhookSubscriptionTable.createdAt),
        )) as WebhookSubscription[];
    }
    // Match subscriptions where eventTypes contains eventType, OR
    // eventTypes is empty (wildcard). The `||` array-concat trick
    // checks for either condition in a single SQL fragment.
    return (await db
      .select()
      .from(WebhookSubscriptionTable)
      .where(
        and(
          eq(WebhookSubscriptionTable.userId, userId),
          sql`(
            cardinality(${WebhookSubscriptionTable.eventTypes}) = 0
            OR ${eventType} = ANY(${WebhookSubscriptionTable.eventTypes})
          )`,
        ),
      )
      .orderBy(
        desc(WebhookSubscriptionTable.createdAt),
      )) as WebhookSubscription[];
  },

  async listWebhookSubscriptionsForUser(
    userId: string,
  ): Promise<WebhookSubscription[]> {
    return await webhookRepository.listWebhookSubscriptions(userId);
  },

  async getWebhookSubscription(
    id: string,
    userId: string,
  ): Promise<WebhookSubscription | null> {
    const [row] = await db
      .select()
      .from(WebhookSubscriptionTable)
      .where(
        and(
          eq(WebhookSubscriptionTable.id, id),
          eq(WebhookSubscriptionTable.userId, userId),
        ),
      );
    return (row as WebhookSubscription | undefined) ?? null;
  },

  async updateWebhookSubscription(
    id: string,
    userId: string,
    patch: UpdateWebhookSubscriptionInput,
  ): Promise<WebhookSubscription | null> {
    const [row] = await db
      .update(WebhookSubscriptionTable)
      .set({
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.eventTypes !== undefined
          ? { eventTypes: patch.eventTypes }
          : {}),
        ...(patch.secretHash !== undefined
          ? { secretHash: patch.secretHash }
          : {}),
        ...(patch.signingSecret !== undefined
          ? { signingSecret: patch.signingSecret }
          : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      })
      .where(
        and(
          eq(WebhookSubscriptionTable.id, id),
          eq(WebhookSubscriptionTable.userId, userId),
        ),
      )
      .returning();
    return (row as WebhookSubscription | undefined) ?? null;
  },

  async deleteWebhookSubscription(
    id: string,
    userId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(WebhookSubscriptionTable)
      .where(
        and(
          eq(WebhookSubscriptionTable.id, id),
          eq(WebhookSubscriptionTable.userId, userId),
        ),
      )
      .returning({ id: WebhookSubscriptionTable.id });
    return result.length > 0;
  },

  async updateWebhookSubscriptionStats(
    id: string,
    patch: UpdateWebhookSubscriptionStatsPatch,
  ): Promise<WebhookSubscription | null> {
    const [row] = await db
      .update(WebhookSubscriptionTable)
      .set({
        ...(patch.failureCount !== undefined
          ? { failureCount: patch.failureCount }
          : {}),
        ...(patch.lastSuccessAt !== undefined
          ? { lastSuccessAt: patch.lastSuccessAt }
          : {}),
        ...(patch.lastFailureAt !== undefined
          ? { lastFailureAt: patch.lastFailureAt }
          : {}),
        ...(patch.lastFailureReason !== undefined
          ? { lastFailureReason: patch.lastFailureReason }
          : {}),
      })
      .where(eq(WebhookSubscriptionTable.id, id))
      .returning();
    return (row as WebhookSubscription | undefined) ?? null;
  },

  /**
   * Fetch the plaintext signing secret for a single subscription. The
   * worker (P3.4) calls this on every delivery so the secret is read
   * at most once per (event, subscription) tuple. NULL means the
   * subscription was created before P3.4 and has not been re-provisioned
   * — the worker treats NULL as "skip this subscription".
   *
   * NOTE: `signing_secret` is stored as PLAINTEXT for signing; encrypt at
   * rest in a future hardening pass. See migration
   * `0024_webhook_signing_secret.sql` for the rationale.
   */
  async getWebhookSubscriptionSigningSecret(
    id: string,
    userId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select({
        signingSecret: WebhookSubscriptionTable.signingSecret,
      })
      .from(WebhookSubscriptionTable)
      .where(
        and(
          eq(WebhookSubscriptionTable.id, id),
          eq(WebhookSubscriptionTable.userId, userId),
        ),
      );
    return row?.signingSecret ?? null;
  },

  // ---- outbox -------------------------------------------------------------

  /**
   * Enqueue a new event. The event is not yet fanned out — the worker
   * calls `claimPendingOutboxEvents`, materializes `webhook_delivery`
   * rows for every matching subscription, and processes those.
   */
  async enqueueOutboxEvent(
    input: EnqueueOutboxEventInput,
  ): Promise<WebhookEventOutbox> {
    const [row] = await db
      .insert(WebhookEventOutboxTable)
      .values({
        kind: input.kind,
        eventType: input.eventType,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? 5,
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
      } satisfies NewWebhookEventOutbox)
      .returning();
    return row as WebhookEventOutbox;
  },

  /**
   * Worker-facing atomic claim. Returns pending events whose
   * `next_attempt_at` is at or before `now`, ordered by
   * `next_attempt_at` ascending. This method does NOT mutate the
   * rows — the worker is responsible for moving status to
   * 'delivering' and updating attempts / next_attempt_at on
   * success / failure.
   */
  async claimPendingOutboxEvents(
    now: Date,
    limit: number,
  ): Promise<WebhookEventOutbox[]> {
    return (await db
      .select()
      .from(WebhookEventOutboxTable)
      .where(
        and(
          eq(WebhookEventOutboxTable.status, "pending"),
          lte(WebhookEventOutboxTable.nextAttemptAt, now),
        ),
      )
      .orderBy(WebhookEventOutboxTable.nextAttemptAt)
      .limit(limit)) as WebhookEventOutbox[];
  },

  async markOutboxEventDelivered(
    eventId: string,
  ): Promise<WebhookEventOutbox | null> {
    const [row] = await db
      .update(WebhookEventOutboxTable)
      .set({
        status: "delivered",
        updatedAt: new Date(),
      })
      .where(eq(WebhookEventOutboxTable.id, eventId))
      .returning();
    return (row as WebhookEventOutbox | undefined) ?? null;
  },

  async markOutboxEventFailed(
    eventId: string,
    error: string,
    nextAttemptAt: Date,
  ): Promise<WebhookEventOutbox | null> {
    const [row] = await db
      .update(WebhookEventOutboxTable)
      .set({
        status: "pending",
        lastError: error,
        nextAttemptAt,
        updatedAt: new Date(),
      })
      .where(eq(WebhookEventOutboxTable.id, eventId))
      .returning();
    return (row as WebhookEventOutbox | undefined) ?? null;
  },

  // ---- deliveries ---------------------------------------------------------

  /**
   * Materialize one delivery row per (event, subscriber). The UNIQUE
   * (event_id, subscription_id) constraint on the table means a
   * duplicate insert is a no-op; the worker uses `onConflictDoNothing`
   * via the `returning` to surface newly created rows only. (For P3.0
   * we keep this simple: just insert; the worker handles dedup via
   * a SELECT-first loop.)
   */
  async createWebhookDelivery(
    input: CreateWebhookDeliveryInput,
  ): Promise<WebhookDelivery> {
    const [row] = await db
      .insert(WebhookDeliveryTable)
      .values({
        eventId: input.eventId,
        subscriptionId: input.subscriptionId,
      } satisfies NewWebhookDelivery)
      .returning();
    return row as WebhookDelivery;
  },

  async markWebhookDeliveryDelivered(
    deliveryId: string,
  ): Promise<WebhookDelivery | null> {
    const [row] = await db
      .update(WebhookDeliveryTable)
      .set({
        status: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(WebhookDeliveryTable.id, deliveryId))
      .returning();
    return (row as WebhookDelivery | undefined) ?? null;
  },

  async markWebhookDeliveryFailed(
    deliveryId: string,
    error: string,
  ): Promise<WebhookDelivery | null> {
    const [row] = await db
      .update(WebhookDeliveryTable)
      .set({
        status: "failed",
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(WebhookDeliveryTable.id, deliveryId))
      .returning();
    return (row as WebhookDelivery | undefined) ?? null;
  },

  /**
   * Get every delivery row for a given event — useful for the
   * "deliveries" panel in the dashboard and for worker recovery.
   */
  async getEventDeliveries(eventId: string): Promise<WebhookDelivery[]> {
    return (await db
      .select()
      .from(WebhookDeliveryTable)
      .where(eq(WebhookDeliveryTable.eventId, eventId))
      .orderBy(desc(WebhookDeliveryTable.createdAt))) as WebhookDelivery[];
  },

  async listWebhookDeliveriesForSubscription(
    subscriptionId: string,
    userId: string,
    limit = 25,
  ): Promise<WebhookDeliveryWithEvent[]> {
    const rows = await db
      .select({
        delivery: WebhookDeliveryTable,
        event: WebhookEventOutboxTable,
      })
      .from(WebhookDeliveryTable)
      .innerJoin(
        WebhookEventOutboxTable,
        eq(WebhookDeliveryTable.eventId, WebhookEventOutboxTable.id),
      )
      .innerJoin(
        WebhookSubscriptionTable,
        eq(WebhookDeliveryTable.subscriptionId, WebhookSubscriptionTable.id),
      )
      .where(
        and(
          eq(WebhookDeliveryTable.subscriptionId, subscriptionId),
          eq(WebhookSubscriptionTable.userId, userId),
        ),
      )
      .orderBy(desc(WebhookDeliveryTable.createdAt))
      .limit(limit);

    return rows as WebhookDeliveryWithEvent[];
  },
};
