import { serverCache } from "lib/cache";
import logger from "logger";
import { getAdminConfigSection } from "lib/admin/site-config-reader";

/**
 * Synchronous default limits. Use `getFreeTierLimits()` instead whenever
 * the caller is in an async context so admin overrides from the
 * `site_config.general` row are honored.
 */
// Self-hosted defaults. Image generation/editing run on the self-hosted
// image-proxy, so there is no per-day cap by default (effectively unlimited).
// Override any of these via the admin site config or the FREE_TIER_* env vars.
export const FREE_TIER_LIMITS = {
  dailyTokens: Number(process.env.FREE_TIER_DAILY_TOKENS) || 150_000,
  dailyImageGenerations:
    Number(process.env.FREE_TIER_DAILY_IMAGE_GENERATIONS) || 1_000_000,
  dailyImageEdits: Number(process.env.FREE_TIER_DAILY_IMAGE_EDITS) || 1_000_000,
} as const;

export const getFreeTierLimits = async () => {
  const general = await getAdminConfigSection("general").catch(() => null);
  return {
    dailyTokens:
      (general?.freeTierDailyTokenLimit as number | undefined) ??
      FREE_TIER_LIMITS.dailyTokens,
    dailyImageGenerations:
      (general?.freeTierDailyImageGenerations as number | undefined) ??
      FREE_TIER_LIMITS.dailyImageGenerations,
    dailyImageEdits:
      (general?.freeTierDailyImageEdits as number | undefined) ??
      FREE_TIER_LIMITS.dailyImageEdits,
  };
};

type FreeTierUsage = {
  dateKey: string;
  resetAt: number;
  tokensUsed: number;
  imageGenerationsUsed: number;
  imageEditsUsed: number;
};

type FreeTierLimitCheck = FreeTierUsage & {
  allowed: boolean;
  remaining: {
    tokens: number;
    imageGenerations: number;
    imageEdits: number;
  };
};

const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const hasUpstashRest = Boolean(UPSTASH_REST_URL && UPSTASH_REST_TOKEN);

// Free-tier enforcement MUST share state across server instances. Without
// Upstash the counters live in per-instance memory and every limit becomes
// "limit × instance count" — make that visible in production logs.
if (
  !hasUpstashRest &&
  process.env.NODE_ENV === "production" &&
  !process.env.FREE_TIER_ALLOW_MEMORY_FALLBACK
) {
  logger.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured — free-tier counters use per-instance memory and CAN BE BYPASSED on multi-instance deployments.",
  );
}
const READ_ONLY_UPSTASH_COMMANDS = new Set([
  "GET",
  "EXISTS",
  "KEYS",
  "MGET",
  "PING",
]);

const prefixKey = (key: string) => `rate:free:${key}`;

const getDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const getUtcDayResetAt = (date = new Date()) =>
  Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );

const getTtlMs = (date = new Date()) =>
  Math.max(60_000, getUtcDayResetAt(date) - date.getTime());

const parseInteger = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getRedisKeys = (userId: string, dateKey = getDayKey()) => ({
  tokens: prefixKey(`${dateKey}:${userId}:tokens`),
  imageGenerations: prefixKey(`${dateKey}:${userId}:image-generations`),
  imageEdits: prefixKey(`${dateKey}:${userId}:image-edits`),
});

const runUpstashCommand = async <T = unknown>(
  command: Array<string | number>,
): Promise<T> => {
  const [commandName] = command;
  if (typeof commandName !== "string" || commandName.length === 0) {
    throw new Error("Upstash error: Invalid command");
  }

  const method = READ_ONLY_UPSTASH_COMMANDS.has(commandName.toUpperCase())
    ? "GET"
    : "POST";
  const path = command
    .map((part) => encodeURIComponent(String(part)))
    .join("/");

  const response = await fetch(`${UPSTASH_REST_URL!}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN!}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Upstash command failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    result?: T;
    error?: string;
  };
  if (data.error) {
    throw new Error(data.error);
  }
  return data.result as T;
};

const getCounter = async (key: string): Promise<number> => {
  if (hasUpstashRest) {
    const value = await runUpstashCommand<string | null>(["GET", key]);
    return parseInteger(value);
  }
  const value = await serverCache.get<number>(key);
  return parseInteger(value);
};

const incrementCounter = async (
  key: string,
  amount: number,
  ttlMs: number,
): Promise<number> => {
  // Negative amounts are required to release/settle reservations — only a
  // zero delta is a no-op.
  if (amount === 0) return getCounter(key);

  if (hasUpstashRest) {
    const nextValue = await runUpstashCommand<number>(["INCRBY", key, amount]);
    const ttlSeconds = Math.max(1, Math.floor(ttlMs / 1000));
    await runUpstashCommand<number>(["EXPIRE", key, ttlSeconds]);
    return parseInteger(nextValue);
  }

  const current = await getCounter(key);
  const next = current + amount;
  await serverCache.set(key, next, ttlMs);
  return next;
};

export const getFreeTierUsage = async (
  userId: string,
): Promise<FreeTierUsage> => {
  const date = new Date();
  const dateKey = getDayKey(date);
  const resetAt = getUtcDayResetAt(date);
  const keys = getRedisKeys(userId, dateKey);

  try {
    const [tokensUsed, imageGenerationsUsed, imageEditsUsed] =
      await Promise.all([
        getCounter(keys.tokens),
        getCounter(keys.imageGenerations),
        getCounter(keys.imageEdits),
      ]);

    return {
      dateKey,
      resetAt,
      tokensUsed,
      imageGenerationsUsed,
      imageEditsUsed,
    };
  } catch (error) {
    logger.error("Failed to read free-tier usage from Redis", error);
    return {
      dateKey,
      resetAt,
      tokensUsed: 0,
      imageGenerationsUsed: 0,
      imageEditsUsed: 0,
    };
  }
};

export const getFreeTierLimitCheck = async (
  userId: string,
): Promise<FreeTierLimitCheck> => {
  const usage = await getFreeTierUsage(userId);
  const limits = await getFreeTierLimits();
  const remaining = {
    tokens: Math.max(0, limits.dailyTokens - usage.tokensUsed),
    imageGenerations: Math.max(
      0,
      limits.dailyImageGenerations - usage.imageGenerationsUsed,
    ),
    imageEdits: Math.max(0, limits.dailyImageEdits - usage.imageEditsUsed),
  };

  return {
    ...usage,
    allowed: remaining.tokens > 0,
    remaining,
  };
};

export const recordFreeTierTokenUsage = async (
  userId: string,
  tokens: number,
): Promise<void> => {
  if (tokens <= 0) return;
  const now = new Date();
  const keys = getRedisKeys(userId, getDayKey(now));
  const ttlMs = getTtlMs(now);
  try {
    await incrementCounter(keys.tokens, Math.floor(tokens), ttlMs);
  } catch (error) {
    logger.error("Failed to increment free-tier token usage", error);
  }
};

// ---------------------------------------------------------------------------
// Reserve-before-generate (TOCTOU fix)
// ---------------------------------------------------------------------------
// The old flow (check remaining > 0 → generate → record actual usage at
// stream finish) let N concurrent requests all pass the same check and let a
// single request with 1 token remaining bill an unbounded stream. Instead we
// atomically INCRBY a conservative estimate up-front — rejecting when the
// post-increment value exceeds the daily limit — then reconcile with the real
// usage once the stream finishes. Worst-case overspend is bounded by one
// reservation instead of being unbounded.
// ---------------------------------------------------------------------------

const TOKEN_RESERVATION_MIN =
  Number(process.env.FREE_TIER_TOKEN_RESERVATION_MIN) || 2_000;
const TOKEN_RESERVATION_MAX =
  Number(process.env.FREE_TIER_TOKEN_RESERVATION_MAX) || 80_000;

export const estimateFreeTierTokenReservation = (
  promptCharacters: number,
): number => {
  // ~3 chars/token heuristic for mixed prose + code, floored so tiny prompts
  // still reserve for the model's response.
  const estimated = Math.ceil(promptCharacters / 3);
  return Math.min(
    Math.max(estimated, TOKEN_RESERVATION_MIN),
    TOKEN_RESERVATION_MAX,
  );
};

export interface FreeTierReservation {
  allowed: boolean;
  reserved: number;
  tokensUsed: number;
}

export const reserveFreeTierTokens = async (
  userId: string,
  estimate: number,
): Promise<FreeTierReservation> => {
  const now = new Date();
  const keys = getRedisKeys(userId, getDayKey(now));
  const ttlMs = getTtlMs(now);
  const limits = await getFreeTierLimits().catch(() => FREE_TIER_LIMITS);
  try {
    // Atomic increment first; the counter is the single source of truth.
    const nextValue = await incrementCounter(
      keys.tokens,
      Math.floor(estimate),
      ttlMs,
    );
    if (nextValue <= limits.dailyTokens) {
      return {
        allowed: true,
        reserved: Math.floor(estimate),
        tokensUsed: nextValue,
      };
    }
    // Over limit — release the reservation so honest retries aren't charged.
    await incrementCounter(keys.tokens, -Math.floor(estimate), ttlMs);
    return {
      allowed: false,
      reserved: 0,
      tokensUsed: nextValue - Math.floor(estimate),
    };
  } catch (error) {
    logger.error("Failed to reserve free-tier tokens", error);
    // Preserve the historical fail-open behavior on infrastructure errors.
    return { allowed: true, reserved: 0, tokensUsed: 0 };
  }
};

/**
 * Reconcile a reservation with the actual token count reported by the model
 * call. `reserved === 0` falls back to plain accounting (reservation failed
 * open or caller is paid tier).
 */
export const settleFreeTierTokenUsage = async (
  userId: string,
  reserved: number,
  totalTokens: number,
): Promise<void> => {
  if (reserved <= 0) {
    return recordFreeTierTokenUsage(userId, totalTokens);
  }
  const delta = Math.floor(totalTokens) - reserved;
  if (delta === 0) return;
  const now = new Date();
  const keys = getRedisKeys(userId, getDayKey(now));
  const ttlMs = getTtlMs(now);
  try {
    await incrementCounter(keys.tokens, delta, ttlMs);
  } catch (error) {
    logger.error("Failed to settle free-tier token usage", error);
  }
};

export const canUseFreeTierImageGeneration = async (
  userId: string,
): Promise<FreeTierLimitCheck> => {
  const usage = await getFreeTierUsage(userId);
  const limits = await getFreeTierLimits();
  const remaining = {
    tokens: Math.max(0, limits.dailyTokens - usage.tokensUsed),
    imageGenerations: Math.max(
      0,
      limits.dailyImageGenerations - usage.imageGenerationsUsed,
    ),
    imageEdits: Math.max(0, limits.dailyImageEdits - usage.imageEditsUsed),
  };

  return {
    ...usage,
    allowed: remaining.imageGenerations > 0,
    remaining,
  };
};

export const canUseFreeTierImageEdit = async (
  userId: string,
): Promise<FreeTierLimitCheck> => {
  const usage = await getFreeTierUsage(userId);
  const limits = await getFreeTierLimits();
  const remaining = {
    tokens: Math.max(0, limits.dailyTokens - usage.tokensUsed),
    imageGenerations: Math.max(
      0,
      limits.dailyImageGenerations - usage.imageGenerationsUsed,
    ),
    imageEdits: Math.max(0, limits.dailyImageEdits - usage.imageEditsUsed),
  };

  return {
    ...usage,
    allowed: remaining.imageEdits > 0,
    remaining,
  };
};

export const recordFreeTierImageGenerationSuccess = async (
  userId: string,
): Promise<void> => {
  const now = new Date();
  const keys = getRedisKeys(userId, getDayKey(now));
  const ttlMs = getTtlMs(now);
  try {
    await incrementCounter(keys.imageGenerations, 1, ttlMs);
  } catch (error) {
    logger.error("Failed to increment free-tier image generation usage", error);
  }
};

export const recordFreeTierImageEditSuccess = async (
  userId: string,
): Promise<void> => {
  const now = new Date();
  const keys = getRedisKeys(userId, getDayKey(now));
  const ttlMs = getTtlMs(now);
  try {
    await incrementCounter(keys.imageEdits, 1, ttlMs);
  } catch (error) {
    logger.error("Failed to increment free-tier image edit usage", error);
  }
};
