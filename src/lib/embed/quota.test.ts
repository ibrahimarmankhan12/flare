import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMBED_DAILY_MESSAGE_QUOTAS,
  applyEmbedSessionQuota,
  getEmbedDailyMessageQuota,
  isEmbedSessionExpired,
  normalizeEmbedRateLimitTier,
  shouldResetEmbedDailyCount,
} from "./quota";

const resetDailyCountIfNeededMock = vi.fn();
const incrementDailyMessageCountMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  embedSessionRepository: {
    resetDailyCountIfNeeded: (...args: unknown[]) =>
      resetDailyCountIfNeededMock(...args),
    incrementDailyMessageCount: (...args: unknown[]) =>
      incrementDailyMessageCountMock(...args),
  },
}));

const makeSession = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "session-1",
    agentId: "agent-1",
    userId: "user-1",
    anonymousToken: "anon-1",
    rateLimitTier: "free",
    dailyMessageCount: 0,
    dailyResetAt: new Date("2026-06-01T00:00:00.000Z"),
    firstMessageCaptchaAt: null,
    expiresAt: new Date("2026-06-01T01:00:00.000Z"),
    revokedAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  }) as any;

describe("embed quota", () => {
  beforeEach(() => {
    resetDailyCountIfNeededMock.mockReset();
    incrementDailyMessageCountMock.mockReset();
  });

  it("defines the required daily quotas", () => {
    expect(EMBED_DAILY_MESSAGE_QUOTAS).toEqual({
      free: 20,
      pro: 100,
      team: 500,
      business: 2000,
    });
  });

  it("normalizes unknown tiers to free", () => {
    expect(normalizeEmbedRateLimitTier("pro")).toBe("pro");
    expect(normalizeEmbedRateLimitTier("enterprise")).toBe("free");
    expect(getEmbedDailyMessageQuota(undefined)).toBe(20);
  });

  it("detects expired and revoked sessions", () => {
    const now = new Date("2026-06-01T00:10:00.000Z");
    expect(
      isEmbedSessionExpired(
        makeSession({ expiresAt: new Date("2026-06-01T00:09:59.000Z") }),
        now,
      ),
    ).toBe(true);
    expect(isEmbedSessionExpired(makeSession({ revokedAt: now }), now)).toBe(
      true,
    );
    expect(isEmbedSessionExpired(makeSession(), now)).toBe(false);
  });

  it("resets daily count only after a full day", () => {
    const session = makeSession({
      dailyResetAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(
      shouldResetEmbedDailyCount(session, new Date("2026-06-01T23:59:59.000Z")),
    ).toBe(false);
    expect(
      shouldResetEmbedDailyCount(session, new Date("2026-06-02T00:00:00.000Z")),
    ).toBe(true);
  });

  it("increments and returns remaining quota when allowed", async () => {
    const session = makeSession({ dailyMessageCount: 19 });
    incrementDailyMessageCountMock.mockResolvedValue(
      makeSession({ dailyMessageCount: 20 }),
    );

    const result = await applyEmbedSessionQuota(
      session,
      new Date("2026-06-01T00:05:00.000Z"),
    );

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(incrementDailyMessageCountMock).toHaveBeenCalledWith("session-1");
  });

  it("denies requests at the tier limit without incrementing", async () => {
    const result = await applyEmbedSessionQuota(
      makeSession({ dailyMessageCount: 20 }),
      new Date("2026-06-01T00:05:00.000Z"),
    );

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("embed-quota-exceeded");
    }
    expect(incrementDailyMessageCountMock).not.toHaveBeenCalled();
  });

  it("resets stale daily counts before applying quota", async () => {
    const stale = makeSession({
      dailyMessageCount: 20,
      dailyResetAt: new Date("2026-05-31T00:00:00.000Z"),
    });
    resetDailyCountIfNeededMock.mockResolvedValue(
      makeSession({
        dailyMessageCount: 0,
        dailyResetAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    );
    incrementDailyMessageCountMock.mockResolvedValue(
      makeSession({
        dailyMessageCount: 1,
        dailyResetAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    );

    const result = await applyEmbedSessionQuota(
      stale,
      new Date("2026-06-01T00:00:00.000Z"),
    );

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    expect(resetDailyCountIfNeededMock).toHaveBeenCalledWith(
      "session-1",
      new Date("2026-06-01T00:00:00.000Z"),
    );
  });
});
