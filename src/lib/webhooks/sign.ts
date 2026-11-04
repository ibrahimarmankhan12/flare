// ---------------------------------------------------------------------------
// P3.4 — Webhook HMAC-SHA-256 signing / verification (pure)
// ---------------------------------------------------------------------------
// The header convention matches Stripe / GitHub:
//
//   X-Webhook-Signature: t=<unix-seconds>,v1=<hex-of-HMAC-SHA-256>
//
// We sign `${timestamp}.${payload}` so that:
//
//   * a tampered payload invalidates the signature (the payload is part
//     of the HMAC input), and
//   * a replayed payload (same body, different time) is caught by the
//     5-minute timestamp freshness window in `verifySignature`.
//
// `node:crypto.timingSafeEqual` is used for the comparison so that
// signature verification is constant-time. The functions in this file
// have no I/O — they're safe to use in the worker, in an HTTP route,
// or in tests without a database.
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";

/** Maximum age of a signed payload, in seconds (replay protection). */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const HEADER_PREFIX = "t=";
const HEADER_V1_PREFIX = "v1=";

export const signPayload = (
  payload: string,
  secret: string,
): { signature: string; timestamp: string } => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return { signature, timestamp };
};

export const formatSignatureHeader = (
  signature: string,
  timestamp: string,
): string => `${HEADER_PREFIX}${timestamp},${HEADER_V1_PREFIX}${signature}`;

export type VerifyResult = { ok: true } | { ok: false; error: string };

export const verifySignature = (
  payload: string,
  secret: string,
  header: string,
): VerifyResult => {
  if (!header || typeof header !== "string") {
    return { ok: false, error: "missing signature header" };
  }

  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return { ok: false, error: "malformed signature header" };
  }
  const { timestamp, signatures } = parsed;
  if (signatures.length === 0) {
    return { ok: false, error: "no v1 signature in header" };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, error: "invalid timestamp" };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const skew = Math.abs(nowSeconds - tsNum);
  if (skew > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, error: "timestamp outside tolerance window" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest();
  const expectedHex = expected.toString("hex");

  for (const candidate of signatures) {
    let candidateBuf: Buffer;
    try {
      candidateBuf = Buffer.from(candidate, "hex");
    } catch {
      continue;
    }
    if (
      candidateBuf.length === expected.length &&
      timingSafeEqual(candidateBuf, expected)
    ) {
      return { ok: true };
    }
    // `timingSafeEqual` only fires when lengths match. We still want
    // to compare hex strings safely when the input was malformed.
    if (
      candidateBuf.length !== expected.length &&
      constantTimeEqualHex(candidate, expectedHex)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, error: "signature mismatch" };
};

const parseSignatureHeader = (
  header: string,
): { timestamp: string; signatures: string[] } | null => {
  // The header is a comma-separated list of `key=value` pairs. We
  // tolerate leading / trailing whitespace per RFC 7230 and split on
  // a single pass.
  const parts = header.split(",").map((p) => p.trim());
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    if (part.startsWith(HEADER_PREFIX)) {
      timestamp = part.slice(HEADER_PREFIX.length);
    } else if (part.startsWith(HEADER_V1_PREFIX)) {
      signatures.push(part.slice(HEADER_V1_PREFIX.length));
    }
  }
  if (timestamp === null) return null;
  return { timestamp, signatures };
};

const constantTimeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};
