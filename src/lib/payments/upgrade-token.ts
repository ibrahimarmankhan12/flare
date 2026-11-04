import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed short-lived token for post-checkout redirects.
 *
 * Dodo's `return_url` is a plain URL — anyone who knows the shape
 * can navigate to `/profile?upgrade=success` and the page used to
 * render the green "You're upgraded" banner. We now put a signed
 * token in the return URL that proves "this URL was minted by the
 * server when a user started a checkout", and the profile page
 * verifies it before showing the success banner.
 *
 * The token is signed with `BETTER_AUTH_SECRET` (already configured
 * for the rest of the app) and binds three things:
 *   - the Flare userId, so a token from one user can't be replayed
 *     against another
 *   - a random nonce, so the URL is non-guessable (each checkout
 *     gets a fresh token)
 *   - an expiry (default 1 hour), so a leaked URL stops being
 *     useful quickly
 *
 * Important: the token is *necessary* but not *sufficient* evidence
 * of a successful payment. The profile page additionally requires an
 * active subscription row in the DB for this user before showing the
 * success banner. The webhook handler is what writes that row.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000;

const getSecret = (): string | null => {
  const raw = process.env.BETTER_AUTH_SECRET;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

interface TokenPayload {
  userId: string;
  nonce: string;
  expiresAt: number;
}

const encodePayload = (payload: TokenPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

const decodePayload = (encoded: string): TokenPayload | null => {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.userId !== "string" || obj.userId.length === 0) return null;
    if (typeof obj.nonce !== "string" || obj.nonce.length === 0) return null;
    if (typeof obj.expiresAt !== "number" || !Number.isFinite(obj.expiresAt))
      return null;
    return {
      userId: obj.userId,
      nonce: obj.nonce,
      expiresAt: obj.expiresAt,
    };
  } catch {
    return null;
  }
};

const computeSignature = (secret: string, encoded: string): string => {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
};

export interface CreateUpgradeTokenInput {
  userId: string;
  nonce: string;
  ttlMs?: number;
}

export const createUpgradeToken = ({
  userId,
  nonce,
  ttlMs = TOKEN_TTL_MS,
}: CreateUpgradeTokenInput): string | null => {
  const secret = getSecret();
  if (!secret) return null;
  if (!userId || !nonce) return null;
  const payload: TokenPayload = {
    userId,
    nonce,
    expiresAt: Date.now() + ttlMs,
  };
  const encoded = encodePayload(payload);
  const sig = computeSignature(secret, encoded);
  return `${encoded}.${sig}`;
};

export interface VerifyUpgradeTokenInput {
  token: string | null | undefined;
  expectedUserId: string;
  expectedNonce: string;
}

export interface VerifyUpgradeTokenResult {
  valid: boolean;
  payload: TokenPayload | null;
  reason:
    | "ok"
    | "missing-secret"
    | "malformed"
    | "bad-signature"
    | "expired"
    | "mismatch";
}

/**
 * Verify a token bound to an expected userId and nonce. The profile
 * page supplies the userId from the session and the nonce from the
 * query string; if either is missing, the token is treated as
 * invalid and no banner is shown.
 */
export const verifyUpgradeToken = (
  input: VerifyUpgradeTokenInput,
): VerifyUpgradeTokenResult => {
  const { token, expectedUserId, expectedNonce } = input;
  if (!token) return { valid: false, payload: null, reason: "malformed" };

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return { valid: false, payload: null, reason: "malformed" };
  }
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const payload = decodePayload(encoded);
  if (!payload) return { valid: false, payload: null, reason: "malformed" };

  const secret = getSecret();
  if (!secret) return { valid: false, payload: null, reason: "missing-secret" };

  const expectedSig = computeSignature(secret, encoded);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expectedSig, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, payload: null, reason: "bad-signature" };
  }

  if (Date.now() > payload.expiresAt) {
    return { valid: false, payload, reason: "expired" };
  }

  if (payload.userId !== expectedUserId || payload.nonce !== expectedNonce) {
    return { valid: false, payload, reason: "mismatch" };
  }

  return { valid: true, payload, reason: "ok" };
};
