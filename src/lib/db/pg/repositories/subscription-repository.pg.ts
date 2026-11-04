import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { NewSubscription, Subscription, SubscriptionTable } from "../schema.pg";

// ---------------------------------------------------------------------------
// P4.0 schema foundation — Subscription repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `subscription` table (Stripe prereq for #19). The
// Stripe webhook handler in P4.B will call `createSubscription` on
// `customer.subscription.created`, `updateSubscription` on status /
// period changes, and `cancelSubscription` on `customer.subscription.deleted`.
// The denormalized `user.tier` is updated separately by the webhook so the
// hot path (rate-limit checks) stays O(1).
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

export type SubscriptionTier = "free" | "pro" | "team" | "business";

export interface CreateSubscriptionInput {
  userId: string;
  orgId?: string | null;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId?: string | null;
  status: SubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  tier?: SubscriptionTier;
}

export interface UpdateSubscriptionInput {
  status?: SubscriptionStatus;
  tier?: SubscriptionTier;
  stripePriceId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

export const subscriptionRepository = {
  /**
   * Idempotent insert keyed on `stripeSubscriptionId` (UNIQUE). A
   * redelivered Stripe webhook for `customer.subscription.created`
   * will no-op the second time and the caller can treat it as
   * success. If the row already exists with a different userId
   * (subscription transferred to a new customer) we update the
   * ownership rather than error.
   */
  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<Subscription> {
    const [row] = await db
      .insert(SubscriptionTable)
      .values({
        userId: input.userId,
        orgId: input.orgId ?? null,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripeCustomerId: input.stripeCustomerId,
        stripePriceId: input.stripePriceId ?? null,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        tier: input.tier ?? "free",
      } satisfies NewSubscription)
      .onConflictDoUpdate({
        target: SubscriptionTable.stripeSubscriptionId,
        set: {
          userId: input.userId,
          orgId: input.orgId ?? null,
          stripeCustomerId: input.stripeCustomerId,
          stripePriceId: input.stripePriceId ?? null,
          status: input.status,
          currentPeriodStart: input.currentPeriodStart ?? null,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
          tier: input.tier ?? "free",
          updatedAt: new Date(),
        },
      })
      .returning();
    return row as Subscription;
  },

  /**
   * Look up by Stripe's natural key. The webhook path calls this on
   * every event delivery. Returns null on miss.
   */
  async getSubscriptionByStripeId(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null> {
    const [row] = await db
      .select()
      .from(SubscriptionTable)
      .where(eq(SubscriptionTable.stripeSubscriptionId, stripeSubscriptionId));
    return (row as Subscription | undefined) ?? null;
  },

  /**
   * A user can have at most one personal subscription at a time
   * (Stripe enforces this on the customer side too). Returns the
   * most-recently-created row. For the team case, use
   * `getSubscriptionForOrg`.
   */
  async getSubscriptionForUser(userId: string): Promise<Subscription | null> {
    const [row] = await db
      .select()
      .from(SubscriptionTable)
      .where(eq(SubscriptionTable.userId, userId))
      .orderBy(desc(SubscriptionTable.createdAt))
      .limit(1);
    return (row as Subscription | undefined) ?? null;
  },

  /**
   * Team-scoped lookup. The Stripe customer is per-team (per the
   * `team.stripe_customer_id` column), so the webhook updates the
   * `org_id` here.
   */
  async getSubscriptionForOrg(orgId: string): Promise<Subscription | null> {
    const [row] = await db
      .select()
      .from(SubscriptionTable)
      .where(eq(SubscriptionTable.orgId, orgId))
      .orderBy(desc(SubscriptionTable.createdAt))
      .limit(1);
    return (row as Subscription | undefined) ?? null;
  },

  /**
   * Patch a subscription. Always also bumps `updatedAt` so the
   * webhook can detect the latest change.
   */
  async updateSubscription(
    stripeSubscriptionId: string,
    patch: UpdateSubscriptionInput,
  ): Promise<Subscription | null> {
    const set: Partial<NewSubscription> = {
      updatedAt: new Date(),
    };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.tier !== undefined) set.tier = patch.tier;
    if (patch.stripePriceId !== undefined) {
      set.stripePriceId = patch.stripePriceId;
    }
    if (patch.currentPeriodStart !== undefined) {
      set.currentPeriodStart = patch.currentPeriodStart;
    }
    if (patch.currentPeriodEnd !== undefined) {
      set.currentPeriodEnd = patch.currentPeriodEnd;
    }
    if (patch.cancelAtPeriodEnd !== undefined) {
      set.cancelAtPeriodEnd = patch.cancelAtPeriodEnd;
    }
    const [row] = await db
      .update(SubscriptionTable)
      .set(set)
      .where(eq(SubscriptionTable.stripeSubscriptionId, stripeSubscriptionId))
      .returning();
    return (row as Subscription | undefined) ?? null;
  },

  /**
   * Mark a subscription as canceled. Called on
   * `customer.subscription.deleted`. The row is retained for audit
   * (the user might resubscribe and we'd want the same id for
   * reconciliation).
   */
  async cancelSubscription(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null> {
    const [row] = await db
      .update(SubscriptionTable)
      .set({
        status: "canceled",
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(SubscriptionTable.stripeSubscriptionId, stripeSubscriptionId))
      .returning();
    return (row as Subscription | undefined) ?? null;
  },

  /**
   * List every subscription that Stripe currently considers active.
   * The reconciliation job (P4.B follow-up) uses this to detect
   * drift between Stripe's state and our DB.
   */
  async listActiveSubscriptions(): Promise<Subscription[]> {
    return (await db
      .select()
      .from(SubscriptionTable)
      .where(
        and(
          sql`${SubscriptionTable.status} IN ('active', 'trialing', 'past_due')`,
        ),
      )
      .orderBy(desc(SubscriptionTable.createdAt))) as Subscription[];
  },
};
