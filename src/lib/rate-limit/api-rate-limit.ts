import "server-only";

import { apiUsageRepository } from "lib/db/repository";

export interface CheckApiRateLimitInput {
  kind: string;
  id: string;
  limit: number;
  windowMs: number;
}

export interface ApiRateLimitResult {
  allowed: boolean;
  key: string;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number;
}

const sanitizePart = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._:-]/g, "_");

export const buildApiRateLimitKey = ({
  kind,
  id,
  windowMs,
}: Pick<CheckApiRateLimitInput, "kind" | "id" | "windowMs">): string => {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return `api:${sanitizePart(kind)}:${sanitizePart(id)}:${windowMs}:${windowStart}`;
};

export const checkApiRateLimit = async ({
  kind,
  id,
  limit,
  windowMs,
}: CheckApiRateLimitInput): Promise<ApiRateLimitResult> => {
  if (!kind.trim()) throw new Error("rate limit kind is required");
  if (!id.trim()) throw new Error("rate limit id is required");
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("rate limit must be a positive integer");
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error("rate limit windowMs must be a positive integer");
  }

  const key = buildApiRateLimitKey({ kind, id, windowMs });
  const resetAt = new Date(Math.ceil(Date.now() / windowMs) * windowMs);
  const bucket = await apiUsageRepository.incrementRateLimitBucket(
    key,
    resetAt,
  );
  const count = bucket.count ?? 0;
  const allowed = count <= limit;
  const retryAfterMs = Math.max(0, resetAt.getTime() - Date.now());

  return {
    allowed,
    key,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterMs,
  };
};
