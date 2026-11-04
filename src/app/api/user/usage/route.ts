import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";
import {
  getFreeTierLimits,
  getFreeTierUsage,
} from "lib/rate-limit/free-tier-usage";
import { NextResponse } from "next/server";
import { isFreeTier, normalizeSubscriptionTier } from "app-types/subscription";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await userRepository.getUserById(session.user.id);
    const tier = normalizeSubscriptionTier(user?.tier);
    const free = isFreeTier(tier);

    if (!free) {
      return NextResponse.json({
        tier,
        isFreeTier: false,
        limits: null,
        usage: null,
        remaining: null,
        percentUsed: 0,
        resetAt: null,
      });
    }

    // Resolve limits from the admin `general` config so changes in the
    // admin panel flow through to the user-facing usage page.
    const [usage, limits] = await Promise.all([
      getFreeTierUsage(session.user.id),
      getFreeTierLimits(),
    ]);
    const remaining = {
      tokens: Math.max(0, limits.dailyTokens - usage.tokensUsed),
      imageGenerations: Math.max(
        0,
        limits.dailyImageGenerations - usage.imageGenerationsUsed,
      ),
      imageEdits: Math.max(
        0,
        limits.dailyImageEdits - usage.imageEditsUsed,
      ),
    };
    const percentUsed = Math.min(
      100,
      Math.round((usage.tokensUsed / limits.dailyTokens) * 100),
    );

    return NextResponse.json({
      tier,
      isFreeTier: true,
      limits,
      usage: usage,
      remaining,
      percentUsed,
      resetAt: usage.resetAt,
    });
  } catch (error) {
    console.error("Failed to get usage", error);
    return NextResponse.json({ error: "Failed to get usage" }, { status: 500 });
  }
}
