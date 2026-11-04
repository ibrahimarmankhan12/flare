import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const HEADER = { alg: "HS256", typ: "JWT" } as const;
const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 60 * 60;

export interface EmbedTokenPayload {
  agentId: string;
  sessionId: string;
  anonymousToken: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface MintEmbedTokenInput {
  agentId: string;
  sessionId: string;
  anonymousToken: string;
  ttlSeconds?: number;
  now?: Date;
}

export class EmbedJwtError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing-secret"
      | "malformed-token"
      | "invalid-signature"
      | "invalid-payload"
      | "expired-token",
  ) {
    super(message);
    this.name = "EmbedJwtError";
  }
}

const getSecret = () => {
  const secret = process.env.EMBED_JWT_SECRET?.trim();
  if (!secret) {
    throw new EmbedJwtError(
      "EMBED_JWT_SECRET is not configured",
      "missing-secret",
    );
  }
  return secret;
};

const base64UrlEncode = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

const base64UrlDecode = (value: string) => {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw new EmbedJwtError("Malformed embed token", "malformed-token");
  }
};

const sign = (data: string, secret: string) =>
  createHmac("sha256", secret).update(data).digest("base64url");

const safeSignatureEqual = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EmbedJwtError(
      `Invalid embed token payload: ${field}`,
      "invalid-payload",
    );
  }
  return value;
};

const assertUnixSeconds = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new EmbedJwtError(
      `Invalid embed token payload: ${field}`,
      "invalid-payload",
    );
  }
  return value as number;
};

const normalizeTtlSeconds = (ttlSeconds?: number) => {
  if (!Number.isFinite(ttlSeconds ?? DEFAULT_TTL_SECONDS)) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.max(
    1,
    Math.min(MAX_TTL_SECONDS, Math.floor(ttlSeconds ?? DEFAULT_TTL_SECONDS)),
  );
};

export const mintEmbedToken = (input: MintEmbedTokenInput): string => {
  const secret = getSecret();
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = normalizeTtlSeconds(input.ttlSeconds);
  const payload: EmbedTokenPayload = {
    agentId: assertNonEmptyString(input.agentId, "agentId"),
    sessionId: assertNonEmptyString(input.sessionId, "sessionId"),
    anonymousToken: assertNonEmptyString(
      input.anonymousToken,
      "anonymousToken",
    ),
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    jti: randomBytes(16).toString("hex"),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(signingInput, secret);
  return `${signingInput}.${signature}`;
};

export const verifyEmbedToken = (
  token: string,
  options?: { now?: Date },
): EmbedTokenPayload => {
  const secret = getSecret();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new EmbedJwtError("Malformed embed token", "malformed-token");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  let header: unknown;
  let rawPayload: unknown;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    rawPayload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (error) {
    if (error instanceof EmbedJwtError) throw error;
    throw new EmbedJwtError("Malformed embed token", "malformed-token");
  }

  if (
    !header ||
    typeof header !== "object" ||
    (header as { alg?: unknown }).alg !== "HS256" ||
    (header as { typ?: unknown }).typ !== "JWT"
  ) {
    throw new EmbedJwtError("Invalid embed token header", "malformed-token");
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!safeSignatureEqual(signature, expectedSignature)) {
    throw new EmbedJwtError(
      "Invalid embed token signature",
      "invalid-signature",
    );
  }

  if (!rawPayload || typeof rawPayload !== "object") {
    throw new EmbedJwtError("Invalid embed token payload", "invalid-payload");
  }
  const payload = rawPayload as Record<string, unknown>;
  const verifiedPayload: EmbedTokenPayload = {
    agentId: assertNonEmptyString(payload.agentId, "agentId"),
    sessionId: assertNonEmptyString(payload.sessionId, "sessionId"),
    anonymousToken: assertNonEmptyString(
      payload.anonymousToken,
      "anonymousToken",
    ),
    iat: assertUnixSeconds(payload.iat, "iat"),
    exp: assertUnixSeconds(payload.exp, "exp"),
    jti: assertNonEmptyString(payload.jti, "jti"),
  };

  if (
    verifiedPayload.exp <=
    Math.floor((options?.now ?? new Date()).getTime() / 1000)
  ) {
    throw new EmbedJwtError("Embed token has expired", "expired-token");
  }

  return verifiedPayload;
};
