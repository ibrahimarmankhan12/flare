// ---------------------------------------------------------------------------
// P3.2 — Inbound request validation (pure)
// ---------------------------------------------------------------------------
// Validates that a request to `/api/inbound/[token]` is authentic for
// the resolved endpoint. The function is pure: it does no I/O and
// does not look anything up in the database. The route handler is
// expected to call `inboundRepository.getInboundEndpointByToken`
// first and pass the result in.
//
// Three outcomes:
//   * `ok: true` — request is valid; proceed to normalization.
//   * `ok: false, status: 404` — endpoint not found, OR endpoint is
//     disabled. Both are intentionally 404 so the public surface
//     cannot enumerate tokens.
//   * `ok: false, status: 401` — endpoint resolved but the provided
//     secret did not match (or the secret hash is set and the
//     provided secret is missing).
// ---------------------------------------------------------------------------

import { createHash, timingSafeEqual } from "node:crypto";

export type ValidationResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 404; error: string };

export interface InboundEndpointForValidation {
  secretHash: string | null;
  enabled: boolean;
}

export interface ValidateInboundRequestInput {
  token: string;
  providedSecret?: string | null;
  endpoint: InboundEndpointForValidation | null;
  /** Raw body string — only used by HMAC validation if/when we add it. */
  rawBody?: string;
}

export const validateInboundRequest = (
  input: ValidateInboundRequestInput,
): ValidationResult => {
  if (!input.token || input.token.length === 0) {
    return { ok: false, status: 404, error: "Endpoint not found" };
  }
  if (!input.endpoint) {
    return { ok: false, status: 404, error: "Endpoint not found" };
  }
  if (!input.endpoint.enabled) {
    return { ok: false, status: 404, error: "Endpoint disabled" };
  }
  if (!input.endpoint.secretHash) {
    // Fail closed: an endpoint without a secret would let ANY caller who
    // knows (or guesses) the URL token trigger agent runs and persist
    // deliveries. Tokens are bearer credentials in URLs and leak via
    // logs/referrers, so a secret is now mandatory. Endpoints created
    // under the old nullable design must set a secret before accepting
    // traffic again.
    return {
      ok: false,
      status: 401,
      error: "Endpoint has no secret configured; contact the owner",
    };
  }
  if (!input.providedSecret || input.providedSecret.length === 0) {
    return { ok: false, status: 401, error: "Invalid secret" };
  }
  // The stored hash is `sha256(secret)` (hex-encoded). We re-hash
  // the provided secret the same way and compare in constant time.
  // We intentionally avoid using `secretHash` as a key for HMAC: the
  // hash is the verifier, and the route also supports passing the
  // shared secret directly in `x-inbound-secret` for simple webhook
  // integrations.
  const provided = sha256Hex(input.providedSecret);
  const expected = input.endpoint.secretHash.toLowerCase();
  if (!safeEqualHex(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid secret" };
  }
  return { ok: true };
};

const sha256Hex = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
};
