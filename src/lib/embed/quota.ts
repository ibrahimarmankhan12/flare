import type { EmbedSession } from "lib/db/pg/schema.pg";
import { embedSessionRepository } from "lib/db/repository";

export const EMBED_DAILY_MESSAGE_QUOTAS = {
  free: 20,
  pro: 100,
  team: 500,
  business: 2000,
} as const;

export type EmbedRateLimitTier = keyof typeof EMBED_DAILY_MESSAGE_QUOTAS;

export type EmbedQuotaAllowedResult = {
  allowed: true;
  session: EmbedSession;
  tier: EmbedRateLimitTier;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export type EmbedQuotaDeniedResult = {
  allowed: false;
  session: EmbedSession;
  tier: EmbedRateLimitTier;
  limit: number;
  remaining: 0;
  resetAt: Date;
  code: "embed-quota-exceeded";
  message: string;
};

export type EmbedQuotaResult = EmbedQuotaAllowedResult | EmbedQuotaDeniedResult;

const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeEmbedRateLimitTier = (
  tier: string | null | undefined,
): EmbedRateLimitTier => {
  if (tier && tier in EMBED_DAILY_MESSAGE_QUOTAS) {
    return tier as EmbedRateLimitTier;
  }
  return "free";
};

export const getEmbedDailyMessageQuota = (
  tier: string | null | undefined,
): number => EMBED_DAILY_MESSAGE_QUOTAS[normalizeEmbedRateLimitTier(tier)];

const getNextDailyResetAt = (resetAt: Date): Date =>
  new Date(resetAt.getTime() + DAY_MS);

export const isEmbedSessionExpired = (
  session: Pick<EmbedSession, "expiresAt" | "revokedAt">,
  now = new Date(),
): boolean => {
  if (session.revokedAt) return true;
  return session.expiresAt.getTime() <= now.getTime();
};

export const shouldResetEmbedDailyCount = (
  session: Pick<EmbedSession, "dailyResetAt">,
  now = new Date(),
): boolean =>
  getNextDailyResetAt(session.dailyResetAt).getTime() <= now.getTime();

export const shouldRequireEmbedCaptcha = (
  session: Pick<EmbedSession, "dailyMessageCount" | "firstMessageCaptchaAt">,
): boolean =>
  session.dailyMessageCount <= 0 && session.firstMessageCaptchaAt === null;

export const applyEmbedSessionQuota = async (
  session: EmbedSession,
  now = new Date(),
): Promise<EmbedQuotaResult> => {
  let effectiveSession = session;
  if (shouldResetEmbedDailyCount(session, now)) {
    effectiveSession =
      (await embedSessionRepository.resetDailyCountIfNeeded(session.id, now)) ??
      session;
  }

  const tier = normalizeEmbedRateLimitTier(effectiveSession.rateLimitTier);
  const limit = getEmbedDailyMessageQuota(tier);
  const currentCount = Math.max(0, effectiveSession.dailyMessageCount ?? 0);
  const resetAt = getNextDailyResetAt(effectiveSession.dailyResetAt);

  if (currentCount >= limit) {
    return {
      allowed: false,
      session: effectiveSession,
      tier,
      limit,
      remaining: 0,
      resetAt,
      code: "embed-quota-exceeded",
      message: `Daily embed message quota reached (${limit}). Please try again after the quota resets.`,
    };
  }

  const incrementedSession =
    (await embedSessionRepository.incrementDailyMessageCount(
      effectiveSession.id,
    )) ?? effectiveSession;
  const nextCount = Math.max(0, incrementedSession.dailyMessageCount ?? 0);

  return {
    allowed: true,
    session: incrementedSession,
    tier,
    limit,
    remaining: Math.max(0, limit - nextCount),
    resetAt: getNextDailyResetAt(incrementedSession.dailyResetAt),
  };
};
