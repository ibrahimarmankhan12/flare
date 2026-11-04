import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { ApiKey } from "lib/db/pg/schema.pg";
import { apiKeyRepository, apiUsageRepository } from "lib/db/repository";
import logger from "logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

// ---------------------------------------------------------------------------
// P3.3 — API key issue / verify / scope helpers (#24 Public REST)
// ---------------------------------------------------------------------------
// Flare issues per-user API keys so external systems can call the public
// `/api/v1/...` REST surface without a Better Auth session. The keys are
// stored hashed (sha-256 hex) in the `api_key` table; only the caller ever
// sees the plaintext — and only at creation time.
//
// Format: `ck_live_` + base64url(32 random bytes)
//   - "ck_live_" prefix is 8 chars
//   - base64url of 32 bytes is ceil(32*4/3) = 43 chars, no padding
//   - total length = 8 + 43 = 51 chars (the spec calls for "≈40" — base64url
//     is dense so we go with the secure 256-bit length and let the prefix
//     give users something to grep for in logs)
// ---------------------------------------------------------------------------

const KEY_PREFIX = "ck_live_";

/**
 * Result of generating a new API key.
 * - `fullKey` is shown to the user exactly once at creation and never
 *   stored. The server only ever retains the sha-256 hash.
 * - `prefix` is the first 8 characters plus an ellipsis, suitable for
 *   display in a "keys" list ("ck_live…").
 * - `hash` is sha-256 hex of `fullKey` — this is what gets persisted.
 */
export interface GeneratedApiKey {
  fullKey: string;
  prefix: string;
  hash: string;
}

/**
 * Generate a new API key.
 *
 * The plaintext `fullKey` is the only thing the user can copy at
 * creation time. Persist `hash` + `prefix` and discard `fullKey` from
 * server memory as soon as the create endpoint returns.
 */
export const generateApiKey = (): GeneratedApiKey => {
  // 32 random bytes -> 43-char base64url string (no padding).
  const random = randomBytes(32).toString("base64url");
  const fullKey = `${KEY_PREFIX}${random}`;
  const hash = hashApiKey(fullKey);
  // Display prefix: first 8 chars + ellipsis. Helps users tell keys
  // apart in a list without revealing enough to brute-force.
  const prefix = `${fullKey.slice(0, 8)}…`;
  return { fullKey, prefix, hash };
};

/**
 * Hash an API key for at-rest comparison.
 * sha-256 hex (64 chars).
 */
export const hashApiKey = (fullKey: string): string => {
  return createHash("sha256").update(fullKey, "utf8").digest("hex");
};

/**
 * Decide whether `keyScopes` authorizes `requiredScope`.
 *
 * Rules:
 * - `*` matches every scope.
 * - `messages:*` (a wildcard prefix) matches `messages:read` and
 *   `messages:write` but not `threads:read`.
 * - Otherwise, the scope must be present in `keyScopes` exactly.
 */
export const verifyApiKeyScopes = (
  keyScopes: string[],
  requiredScope: string,
): boolean => {
  if (!Array.isArray(keyScopes) || keyScopes.length === 0) {
    return false;
  }
  for (const scope of keyScopes) {
    if (scope === "*") return true;
    if (scope === requiredScope) return true;
    if (scope.endsWith(":*")) {
      const prefix = scope.slice(0, -2); // drop the ":*"
      if (requiredScope.startsWith(`${prefix}:`)) return true;
    }
  }
  return false;
};

/**
 * The authenticated context attached to a REST request that presented a
 * valid `Authorization: Bearer <key>` header. Routes can read this off
 * the response and key user-scoped queries by `userId`.
 */
export type ApiKeyContext = {
  userId: string;
  keyId: string;
  scopes: string[];
};

export interface ApiKeyRouteContext<P = unknown> {
  apiKey: ApiKeyContext;
  params?: P;
}

export interface WithApiKeyUsageOptions<P = unknown> {
  scope: string;
  route: string;
  costUnits?: number;
  keyLimit?: number;
  ipLimit?: number;
  windowMs?: number;
  getParams?: () => Promise<P>;
}

type ApiKeyRouteHandler<P> = (
  request: Request,
  context: ApiKeyRouteContext<P>,
) => Promise<Response>;

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_KEY_RATE_LIMIT = 120;
const DEFAULT_IP_RATE_LIMIT = 300;

/**
 * Authenticate a REST request via `Authorization: Bearer <key>`.
 *
 * Returns `null` when:
 * - the header is missing or malformed,
 * - the hash is not in the `api_key` table,
 * - the key is revoked, or
 * - the key is past its `expiresAt`.
 *
 * Does NOT throw — the caller decides what status to emit (we use 401
 * for "no/bad auth", 403 for "auth ok but scope missing"). On success
 * the key's `last_used_at` is bumped (fire-and-forget — the response
 * does not wait on this write so a slow DB cannot stall the request).
 */
export const authenticateApiKey = async (
  req: Request,
): Promise<ApiKeyContext | null> => {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  if (!match) return null;

  const fullKey = match[1]?.trim();
  if (!fullKey || !fullKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashApiKey(fullKey);
  const row = await apiKeyRepository.getApiKeyByHash(keyHash);
  if (!row) return null;

  if (!isKeyUsable(row)) return null;

  // Bump last_used_at asynchronously. We deliberately do not `await` —
  // a transient DB hiccup must not surface as a failed request when the
  // auth itself was successful.
  void apiKeyRepository.updateApiKeyLastUsed(row.id).catch(() => {
    // swallow — telemetry lives in the logger
  });

  return {
    userId: row.userId,
    keyId: row.id,
    scopes: row.scopes ?? [],
  };
};

/**
 * Convenience wrapper around `verifyApiKeyScopes` for routes that just
 * need a boolean "do I have this scope?".
 */
export const requireApiKeyScope = (
  ctx: ApiKeyContext,
  scope: string,
): boolean => {
  return verifyApiKeyScopes(ctx.scopes, scope);
};

export const withApiKeyUsage = <P = unknown>(
  options: WithApiKeyUsageOptions<P>,
  handler: ApiKeyRouteHandler<P>,
) => {
  return async (request: Request): Promise<Response> => {
    const ctx = await authenticateApiKey(request);
    if (!ctx) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!requireApiKeyScope(ctx, options.scope)) {
      const response = new Response(
        `Forbidden: missing scope \`${options.scope}\``,
        { status: 403 },
      );
      await safeRecordApiKeyUsage(
        ctx,
        request,
        options.route,
        response.status,
        0,
      );
      return response;
    }

    const windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
    const keyLimit = options.keyLimit ?? DEFAULT_KEY_RATE_LIMIT;
    const ipLimit = options.ipLimit ?? DEFAULT_IP_RATE_LIMIT;
    const ip = getRequestIp(request);

    try {
      const keyRate = await checkApiRateLimit({
        kind: "key",
        id: ctx.keyId,
        limit: keyLimit,
        windowMs,
      });
      if (!keyRate.allowed) {
        const response = rateLimitedResponse(keyRate.retryAfterMs);
        await safeRecordApiKeyUsage(
          ctx,
          request,
          options.route,
          response.status,
          0,
        );
        return response;
      }

      const ipRate = await checkApiRateLimit({
        kind: "ip",
        id: ip,
        limit: ipLimit,
        windowMs,
      });
      if (!ipRate.allowed) {
        const response = rateLimitedResponse(ipRate.retryAfterMs);
        await safeRecordApiKeyUsage(
          ctx,
          request,
          options.route,
          response.status,
          0,
        );
        return response;
      }
    } catch {
      const response = new Response("Rate limit check failed", { status: 500 });
      await safeRecordApiKeyUsage(
        ctx,
        request,
        options.route,
        response.status,
        0,
      );
      return response;
    }

    let response: Response;
    try {
      response = await handler(request, {
        apiKey: ctx,
        params: options.getParams ? await options.getParams() : undefined,
      });
    } catch (err) {
      // Log the real error server-side; never leak driver/provider
      // messages (SQL fragments, base URLs, etc.) to API consumers.
      logger.error("[api-key] handler failed", err);
      response = new Response("Internal Error", { status: 500 });
    }

    await safeRecordApiKeyUsage(
      ctx,
      request,
      options.route,
      response.status,
      options.costUnits ?? 1,
    );
    return response;
  };
};

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

const isKeyUsable = (row: ApiKey): boolean => {
  if (row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return false;
  if (
    row.rotationGraceEndsAt &&
    row.rotationGraceEndsAt.getTime() <= Date.now()
  ) {
    return false;
  }
  return true;
};

const getRequestIp = (request: Request): string => {
  // Trust order matters: platform-injected headers (CF / Vercel) come
  // first because they cannot be spoofed by the client. X-Forwarded-For
  // is checked LAST and takes the rightmost entry we control — the
  // leftmost value is client-controlled and trivially spoofable.
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }

  return "unknown";
};

const rateLimitedResponse = (retryAfterMs: number): Response =>
  new Response("Too many requests", {
    status: 429,
    headers: {
      "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    },
  });

const safeRecordApiKeyUsage = async (
  ctx: ApiKeyContext,
  request: Request,
  route: string,
  status: number,
  costUnits: number,
): Promise<void> => {
  try {
    await apiUsageRepository.recordApiKeyUsage({
      apiKeyId: ctx.keyId,
      userId: ctx.userId,
      route,
      method: request.method,
      status,
      costUnits,
    });
  } catch {
    // Usage analytics must never hide the API response status.
  }
};
