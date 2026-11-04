import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  const db = {
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    select: vi.fn(() => selectChain),
  };
  const drizzle = {
    and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
    desc: vi.fn((column: unknown) => ({ op: "desc", column })),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: "eq", left, right })),
    isNull: vi.fn((column: unknown) => ({ op: "isNull", column })),
    lte: vi.fn((left: unknown, right: unknown) => ({ op: "lte", left, right })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: "sql",
      strings: Array.from(strings),
      values,
    })),
  };
  return { db, insertChain, updateChain, selectChain, drizzle };
});

vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));
vi.mock("../schema.pg", () => ({
  EmbedSessionTable: {
    id: { name: "id" },
    agentId: { name: "agent_id" },
    userId: { name: "user_id" },
    anonymousToken: { name: "anonymous_token" },
    rateLimitTier: { name: "rate_limit_tier" },
    dailyMessageCount: { name: "daily_message_count" },
    dailyResetAt: { name: "daily_reset_at" },
    firstMessageCaptchaAt: { name: "first_message_captcha_at" },
    expiresAt: { name: "expires_at" },
    revokedAt: { name: "revoked_at" },
    createdAt: { name: "created_at" },
    updatedAt: { name: "updated_at" },
  },
}));

import { EmbedSessionTable } from "../schema.pg";
import { embedSessionRepository } from "./embed-session-repository.pg";

describe("embedSessionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertChain.values.mockReturnValue(mocks.insertChain);
    mocks.insertChain.returning.mockResolvedValue([]);
    mocks.updateChain.set.mockReturnValue(mocks.updateChain);
    mocks.updateChain.where.mockReturnValue(mocks.updateChain);
    mocks.updateChain.returning.mockResolvedValue([]);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockResolvedValue([]);
  });

  it("creates sessions with free tier and null user defaults", async () => {
    const row = { id: "s1", anonymousToken: "tok" };
    mocks.insertChain.returning.mockResolvedValueOnce([row]);
    const expiresAt = new Date("2026-06-02T00:00:00Z");

    const result = await embedSessionRepository.createEmbedSession({
      agentId: "a1",
      anonymousToken: "tok",
      expiresAt,
    });

    expect(result).toEqual(row);
    expect(mocks.db.insert).toHaveBeenCalledWith(EmbedSessionTable);
    expect(mocks.insertChain.values).toHaveBeenCalledWith({
      agentId: "a1",
      userId: null,
      anonymousToken: "tok",
      rateLimitTier: "free",
      expiresAt,
      firstMessageCaptchaAt: null,
    });
  });

  it("preserves explicit owner, tier, and captcha values when creating", async () => {
    const row = { id: "s2", userId: "u1", rateLimitTier: "flare-pro" };
    mocks.insertChain.returning.mockResolvedValueOnce([row]);
    const expiresAt = new Date("2026-06-02T00:00:00Z");
    const firstMessageCaptchaAt = new Date("2026-06-01T00:00:00Z");

    const result = await embedSessionRepository.createEmbedSession({
      agentId: "a1",
      userId: "u1",
      anonymousToken: "tok",
      rateLimitTier: "flare-pro",
      expiresAt,
      firstMessageCaptchaAt,
    });

    expect(result).toEqual(row);
    expect(mocks.insertChain.values).toHaveBeenCalledWith({
      agentId: "a1",
      userId: "u1",
      anonymousToken: "tok",
      rateLimitTier: "flare-pro",
      expiresAt,
      firstMessageCaptchaAt,
    });
  });

  it("returns null when token lookup has no row", async () => {
    mocks.selectChain.where.mockResolvedValueOnce([]);

    const result = await embedSessionRepository.getEmbedSessionByToken("tok");

    expect(result).toBeNull();
    expect(mocks.db.select).toHaveBeenCalledWith();
    expect(mocks.selectChain.from).toHaveBeenCalledWith(EmbedSessionTable);
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(
      EmbedSessionTable.anonymousToken,
      "tok",
    );
    expect(mocks.selectChain.where).toHaveBeenCalledWith({
      op: "eq",
      left: EmbedSessionTable.anonymousToken,
      right: "tok",
    });
  });

  it("revokes sessions with owner scoping when userId is provided", async () => {
    const row = { id: "s1", revokedAt: new Date() };
    mocks.updateChain.returning.mockResolvedValueOnce([row]);

    const result = await embedSessionRepository.revokeEmbedSession("s1", "u1");

    expect(result).toEqual(row);
    expect(mocks.db.update).toHaveBeenCalledWith(EmbedSessionTable);
    expect(mocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        revokedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(EmbedSessionTable.id, "s1");
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(
      EmbedSessionTable.userId,
      "u1",
    );
    expect(mocks.drizzle.and).toHaveBeenCalledWith(
      { op: "eq", left: EmbedSessionTable.id, right: "s1" },
      { op: "eq", left: EmbedSessionTable.userId, right: "u1" },
    );
  });

  it("increments daily message count using the persisted count plus one", async () => {
    const row = { id: "s1", dailyMessageCount: 2 };
    mocks.updateChain.returning.mockResolvedValueOnce([row]);

    const result =
      await embedSessionRepository.incrementDailyMessageCount("s1");

    expect(result).toEqual(row);
    expect(mocks.drizzle.sql).toHaveBeenCalledWith(
      expect.arrayContaining(["", " + 1"]),
      EmbedSessionTable.dailyMessageCount,
    );
    expect(mocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyMessageCount: expect.objectContaining({
          op: "sql",
          values: [EmbedSessionTable.dailyMessageCount],
        }),
        updatedAt: expect.any(Date),
      }),
    );
    expect(mocks.updateChain.where).toHaveBeenCalledWith({
      op: "eq",
      left: EmbedSessionTable.id,
      right: "s1",
    });
  });

  it("resets daily count only when reset time is due", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const row = { id: "s1", dailyMessageCount: 0, dailyResetAt: now };
    mocks.updateChain.returning.mockResolvedValueOnce([row]);

    const result = await embedSessionRepository.resetDailyCountIfNeeded(
      "s1",
      now,
    );

    expect(result).toEqual(row);
    expect(mocks.updateChain.set).toHaveBeenCalledWith({
      dailyMessageCount: 0,
      dailyResetAt: now,
      updatedAt: now,
    });
    expect(mocks.drizzle.lte).toHaveBeenCalledWith(
      EmbedSessionTable.dailyResetAt,
      now,
    );
    expect(mocks.updateChain.where).toHaveBeenCalledWith({
      op: "and",
      conditions: [
        { op: "eq", left: EmbedSessionTable.id, right: "s1" },
        { op: "lte", left: EmbedSessionTable.dailyResetAt, right: now },
      ],
    });
  });

  it("lists only active sessions for the requested agent owner", async () => {
    const rows = [{ id: "s1" }, { id: "s2" }];
    mocks.selectChain.where.mockImplementationOnce(() => mocks.selectChain);
    mocks.selectChain.orderBy.mockResolvedValueOnce(rows);

    const result = await embedSessionRepository.listEmbedSessionsForAgent(
      "a1",
      "u1",
    );

    expect(result).toEqual(rows);
    expect(mocks.selectChain.from).toHaveBeenCalledWith(EmbedSessionTable);
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(
      EmbedSessionTable.agentId,
      "a1",
    );
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(
      EmbedSessionTable.userId,
      "u1",
    );
    expect(mocks.drizzle.isNull).toHaveBeenCalledWith(
      EmbedSessionTable.revokedAt,
    );
    expect(mocks.selectChain.where).toHaveBeenCalledWith({
      op: "and",
      conditions: [
        { op: "eq", left: EmbedSessionTable.agentId, right: "a1" },
        { op: "eq", left: EmbedSessionTable.userId, right: "u1" },
        { op: "isNull", column: EmbedSessionTable.revokedAt },
      ],
    });
    expect(mocks.drizzle.desc).toHaveBeenCalledWith(
      EmbedSessionTable.createdAt,
    );
    expect(mocks.selectChain.orderBy).toHaveBeenCalledWith({
      op: "desc",
      column: EmbedSessionTable.createdAt,
    });
  });
});
