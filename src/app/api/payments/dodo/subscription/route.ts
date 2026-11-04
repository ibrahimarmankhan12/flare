import {
  SubscriptionTierName,
  isFreeTier,
  normalizeSubscriptionTier,
  subscriptionTiersInfo,
} from "app-types/subscription";
import { auth } from "auth/server";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import {
  getDodoProductIdForTier,
  isDodoPaymentsEnabled,
} from "lib/payments/dodo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface SubscriptionResponse {
  enabled: boolean;
  tier: SubscriptionTierName;
  isFreeTier: boolean;
  activeSubscription: {
    id: string;
    dodoSubscriptionId: string;
    dodoCustomerId: string | null;
    status: string;
    previousBillingDate: string | null;
    nextBillingDate: string | null;
    cancelAtNextBillingDate: boolean;
    cancelledAt: string | null;
  } | null;
  availableTiers: Array<{
    tier: SubscriptionTierName;
    label: string;
    pricePerMonthInr: number;
    description: string;
    productId: string | null;
    purchasable: boolean;
  }>;
}

export const GET = async (
  _request: NextRequest,
): Promise<NextResponse<SubscriptionResponse | { error: string }>> => {
  let session;
  try {
    session = await auth.api.getSession({ headers: _request.headers });
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const user = await userRepository.getUserById(session.user.id);
  const tier = normalizeSubscriptionTier(user?.tier);

  const subscriptions = await dodoPaymentsRepository.listSubscriptionsForUser(
    session.user.id,
  );
  const active =
    subscriptions.find((s) => s.status === "active") ??
    subscriptions[0] ??
    null;

  // Make tier -> product_id mapping visible to the client so the UI
  // can grey out tiers the admin hasn't provisioned in Dodo yet.
  const availableTiers = await Promise.all(
    Object.entries(subscriptionTiersInfo).map(async ([key, info]) => {
      const tierKey = key as SubscriptionTierName;
      const isPaid = tierKey !== "free";
      const productId = isPaid ? await getDodoProductIdForTier(tierKey) : null;
      return {
        tier: tierKey,
        label: info.label,
        pricePerMonthInr: info.pricePerMonthInr,
        description: info.description,
        productId,
        purchasable: isPaid && Boolean(productId),
      };
    }),
  );

  return NextResponse.json({
    enabled: await isDodoPaymentsEnabled(),
    tier,
    isFreeTier: isFreeTier(tier),
    activeSubscription: active
      ? {
          id: active.id,
          dodoSubscriptionId: active.dodoSubscriptionId,
          dodoCustomerId: active.dodoCustomerId ?? null,
          status: active.status,
          previousBillingDate: active.previousBillingDate?.toISOString() ?? null,
          nextBillingDate: active.nextBillingDate?.toISOString() ?? null,
          cancelAtNextBillingDate: active.cancelAtNextBillingDate,
          cancelledAt: active.cancelledAt?.toISOString() ?? null,
        }
      : null,
    availableTiers,
  });
};
