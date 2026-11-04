//@vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBackoffMs, deliverWebhook } from "./deliver";

// Bypass the SSRF guard's real DNS lookups — delivery behavior is what
// these tests cover; the guard has its own suite (url-guard.test.ts).
vi.mock("./url-guard", () => ({
  UrlBlockedError: class UrlBlockedError extends Error {},
  assertPublicWebhookUrl: vi.fn(async (raw: string) => new URL(raw)),
}));

const baseInput = {
  url: "https://subscriber.example.com/hook",
  payload: '{"hello":"world"}',
  signature: "0".repeat(64),
  timestamp: "1700000000",
};

describe("deliverWebhook", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns ok:true on 2xx response", async () => {
    fetchSpy.mockResolvedValue(
      new Response("ok", { status: 200, statusText: "OK" }),
    );
    const result = await deliverWebhook(baseInput);
    expect(result).toEqual({ ok: true, status: 200 });
  });

  it("returns ok:false on 4xx response (no throw)", async () => {
    fetchSpy.mockResolvedValue(
      new Response("nope", { status: 404, statusText: "Not Found" }),
    );
    const result = await deliverWebhook(baseInput);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns ok:false on 5xx response (no throw)", async () => {
    fetchSpy.mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );
    const result = await deliverWebhook(baseInput);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it("returns ok:false with error:'timeout' when AbortController fires", async () => {
    vi.useFakeTimers();
    // Fetch that never resolves — the AbortController should fire first.
    fetchSpy.mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          // The abort signal triggers an AbortError on the fetch promise.
          // We replicate that by hooking the signal.
          const signal = (
            fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
          )?.signal;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = deliverWebhook({ ...baseInput, timeoutMs: 5_000 });
    // Advance past the timeout.
    await vi.advanceTimersByTimeAsync(5_001);
    const result = await pending;
    if (!result.ok) {
      expect(result.error).toBe("timeout");
    } else {
      throw new Error("expected deliverWebhook to time out");
    }
  });

  it("returns ok:false with the error message on a network failure", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await deliverWebhook(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("ECONNREFUSED");
    }
  });

  it("uses the default timeout of 10_000 ms when none is supplied", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (
            fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
          )?.signal;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = deliverWebhook(baseInput);
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await pending;
    if (!result.ok) {
      expect(result.error).toBe("timeout");
    } else {
      throw new Error("expected deliverWebhook to time out");
    }
  });
});

describe("computeBackoffMs", () => {
  it("attempt 0 is approximately 1000ms (±20% jitter)", () => {
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(0);
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(1200);
    }
  });

  it("attempt 5 is approximately 32_000ms (±20% jitter)", () => {
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(5);
      expect(ms).toBeGreaterThanOrEqual(25_600);
      expect(ms).toBeLessThanOrEqual(38_400);
    }
  });

  it("attempt 12+ is capped at 1 hour (3_600_000ms ±20% jitter)", () => {
    // 2^12 * 1000ms = 4096s > 3600s, so the cap kicks in at attempt 12.
    // (The plan's "10+ → 3600s" line is approximate; the math says 12+.)
    for (let i = 0; i < 20; i++) {
      const ms12 = computeBackoffMs(12);
      const ms20 = computeBackoffMs(20);
      expect(ms12).toBeGreaterThanOrEqual(2_880_000);
      expect(ms12).toBeLessThanOrEqual(4_320_000);
      expect(ms20).toBeGreaterThanOrEqual(2_880_000);
      expect(ms20).toBeLessThanOrEqual(4_320_000);
    }
  });

  it("attempt 11 is not yet at the cap (2048s ±20%)", () => {
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(11);
      // 2^11 * 1000 = 2,048,000; ±20% = [1,638,400, 2,457,600]
      expect(ms).toBeGreaterThanOrEqual(1_638_400);
      expect(ms).toBeLessThanOrEqual(2_457_600);
    }
  });
});
