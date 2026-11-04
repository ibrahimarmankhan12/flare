import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const incrementRateLimitBucketMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  apiUsageRepository: {
    incrementRateLimitBucket: (...args: unknown[]) =>
      incrementRateLimitBucketMock(...args),
  },
}));

const { buildApiRateLimitKey, checkApiRateLimit } = await import(
  "./api-rate-limit"
);

describe("checkApiRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:30.000Z"));
    vi.resetAllMocks();
  });

  it("allows a request when the bucket count is under the limit", async () => {
    incrementRateLimitBucketMock.mockResolvedValue({ count: 3 });
    const result = await checkApiRateLimit({
      kind: "key",
      id: "k1",
      limit: 10,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
  });

  it("allows the exact limit boundary", async () => {
    incrementRateLimitBucketMock.mockResolvedValue({ count: 10 });
    const result = await checkApiRateLimit({
      kind: "key",
      id: "k1",
      limit: 10,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("rejects a request over the limit", async () => {
    incrementRateLimitBucketMock.mockResolvedValue({ count: 11 });
    const result = await checkApiRateLimit({
      kind: "key",
      id: "k1",
      limit: 10,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("passes a deterministic bucket key and reset timestamp to the repository", async () => {
    incrementRateLimitBucketMock.mockResolvedValue({ count: 1 });
    await checkApiRateLimit({
      kind: "ip",
      id: "127.0.0.1",
      limit: 10,
      windowMs: 60_000,
    });
    expect(incrementRateLimitBucketMock).toHaveBeenCalledWith(
      "api:ip:127.0.0.1:60000:1780315200000",
      new Date("2026-06-01T12:01:00.000Z"),
    );
  });

  it("sanitizes key parts", () => {
    expect(
      buildApiRateLimitKey({
        kind: "k/e y",
        id: "id with spaces",
        windowMs: 60_000,
      }),
    ).toBe("api:k_e_y:id_with_spaces:60000:1780315200000");
  });

  it("rejects invalid limits", async () => {
    await expect(
      checkApiRateLimit({ kind: "key", id: "k1", limit: 0, windowMs: 60_000 }),
    ).rejects.toThrow("positive integer");
  });

  it("rejects invalid windows", async () => {
    await expect(
      checkApiRateLimit({ kind: "key", id: "k1", limit: 1, windowMs: 0 }),
    ).rejects.toThrow("windowMs");
  });
});
