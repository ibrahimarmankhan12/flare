//@vitest-environment node

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SIGNATURE_TOLERANCE_SECONDS,
  formatSignatureHeader,
  signPayload,
  verifySignature,
} from "./sign";

describe("sign / verify webhook payload", () => {
  const secret = "whsec_test_super_secret";
  const payload = JSON.stringify({
    id: "evt_123",
    type: "thread.created",
    data: { threadId: "thr_abc" },
  });

  it("signPayload is deterministic given same inputs", () => {
    // signPayload is NOT deterministic across time (timestamp changes),
    // but the same timestamp + same inputs → same signature. We
    // exercise the determinism of the HMAC by reconstructing the
    // expected signature from the same timestamp that signPayload
    // just produced.
    const { signature, timestamp } = signPayload(payload, secret);
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    expect(signature).toBe(expected);
  });

  it("signPayload output is hex of expected length (64 chars for SHA-256)", () => {
    const { signature } = signPayload(payload, secret);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifySignature round-trips a freshly signed payload", () => {
    const { signature, timestamp } = signPayload(payload, secret);
    const header = formatSignatureHeader(signature, timestamp);
    const result = verifySignature(payload, secret, header);
    expect(result).toEqual({ ok: true });
  });

  it("verifySignature rejects a tampered payload", () => {
    const { signature, timestamp } = signPayload(payload, secret);
    const header = formatSignatureHeader(signature, timestamp);
    const tampered = `${payload} `; // whitespace change
    const result = verifySignature(tampered, secret, header);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("signature mismatch");
    }
  });

  it("verifySignature rejects a tampered secret", () => {
    const { signature, timestamp } = signPayload(payload, secret);
    const header = formatSignatureHeader(signature, timestamp);
    const result = verifySignature(payload, "different_secret", header);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("signature mismatch");
    }
  });

  it("verifySignature rejects an expired timestamp (>5 min old)", () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301; // > 5 min ago
    const sig = createHmac("sha256", secret)
      .update(`${oldTimestamp}.${payload}`)
      .digest("hex");
    const header = formatSignatureHeader(sig, String(oldTimestamp));
    const result = verifySignature(payload, secret, header);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("timestamp outside tolerance window");
    }
  });

  it("verifySignature accepts an exactly-5-min-old timestamp (boundary)", () => {
    // The tolerance check is `skew > SIGNATURE_TOLERANCE_SECONDS`,
    // so skew == tolerance is accepted.
    const boundaryTimestamp =
      Math.floor(Date.now() / 1000) - SIGNATURE_TOLERANCE_SECONDS;
    const sig = createHmac("sha256", secret)
      .update(`${boundaryTimestamp}.${payload}`)
      .digest("hex");
    const header = formatSignatureHeader(sig, String(boundaryTimestamp));
    const result = verifySignature(payload, secret, header);
    expect(result.ok).toBe(true);
  });

  it("verifySignature rejects a malformed header (missing v1)", () => {
    const { timestamp } = signPayload(payload, secret);
    const result = verifySignature(payload, secret, `t=${timestamp}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no v1 signature in header");
    }
  });

  it("verifySignature rejects a header without t= part", () => {
    const { signature } = signPayload(payload, secret);
    const result = verifySignature(payload, secret, `v1=${signature}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("malformed signature header");
    }
  });
});
