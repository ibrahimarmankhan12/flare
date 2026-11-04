import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
  };
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const deleteChain = {
    where: vi.fn(),
    returning: vi.fn(),
  };
  const db = {
    insert: vi.fn(() => insertChain),
    select: vi.fn(() => selectChain),
    delete: vi.fn(() => deleteChain),
  };
  const drizzle = {
    and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
    desc: vi.fn((column: unknown) => ({ op: "desc", column })),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: "eq", left, right })),
    gte: vi.fn((left: unknown, right: unknown) => ({ op: "gte", left, right })),
    lte: vi.fn((left: unknown, right: unknown) => ({ op: "lte", left, right })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: "sql",
      strings: Array.from(strings),
      values,
    })),
  };
  return { db, insertChain, selectChain, deleteChain, drizzle };
});

vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));
vi.mock("../schema.pg", () => ({
  ApiKeyUsageTable: {
    id: { name: "id" },
    apiKeyId: { name: "api_key_id" },
    userId: { name: "user_id" },
    route: { name: "route" },
    method: { name: "method" },
    status: { name: "status" },
    costUnits: { name: "cost_units" },
    createdAt: { name: "created_at" },
  },
  ApiRateLimitBucketTable: {
    id: { name: "id" },
    key: { name: "key" },
    count: { name: "count" },
    resetAt: { name: "reset_at" },
    createdAt: { name: "created_at" },
    updatedAt: { name: "updated_at" },
  },
}));

import { ApiKeyUsageTable, ApiRateLimitBucketTable } from "../schema.pg";
import { apiUsageRepository } from "./api-usage-repository.pg";

describe("apiUsageRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertChain.values.mockReturnValue(mocks.insertChain);
    mocks.insertChain.onConflictDoUpdate.mockReturnValue(mocks.insertChain);
    mocks.insertChain.returning.mockResolvedValue([]);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.groupBy.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockReturnValue(mocks.selectChain);
    mocks.selectChain.limit.mockResolvedValue([]);
    mocks.deleteChain.where.mockReturnValue(mocks.deleteChain);
    mocks.deleteChain.returning.mockResolvedValue([]);
  });

  it("records API usage with default cost unit", async () => {
    const row = { id: "u1", costUnits: 1 };
    mocks.insertChain.returning.mockResolvedValueOnce([row]);

    const result = await apiUsageRepository.recordApiKeyUsage({
      apiKeyId: "k1",
      userId: "u1",
      route: "/api/v1/threads",
      method: "GET",
      status: 200,
    });

    expect(result).toEqual(row);
    expect(mocks.db.insert).toHaveBeenCalledWith(ApiKeyUsageTable);
    expect(mocks.insertChain.values).toHaveBeenCalledWith({
      apiKeyId: "k1",
      userId: "u1",
      route: "/api/v1/threads",
      method: "GET",
      status: 200,
      costUnits: 1,
    });
  });

  it("records API usage with custom cost units", async () => {
    const row = { id: "u2", costUnits: 7 };
    mocks.insertChain.returning.mockResolvedValueOnce([row]);

    const result = await apiUsageRepository.recordApiKeyUsage({
      apiKeyId: "k1",
      userId: "u1",
      route: "/api/v1/messages",
      method: "POST",
      status: 201,
      costUnits: 7,
    });

    expect(result).toEqual(row);
    expect(mocks.insertChain.values).toHaveBeenCalledWith({
      apiKeyId: "k1",
      userId: "u1",
      route: "/api/v1/messages",
      method: "POST",
      status: 201,
      costUnits: 7,
    });
  });

  it("lists usage scoped by API key owner and applies limit", async () => {
    const rows = [{ id: "u1" }, { id: "u2" }];
    mocks.selectChain.where.mockImplementationOnce(() => mocks.selectChain);
    mocks.selectChain.orderBy.mockReturnValueOnce(mocks.selectChain);
    mocks.selectChain.limit.mockResolvedValueOnce(rows);

    const result = await apiUsageRepository.listApiKeyUsage("k1", "u1", 25);

    expect(result).toEqual(rows);
    expect(mocks.selectChain.from).toHaveBeenCalledWith(ApiKeyUsageTable);
    expect(mocks.drizzle.and).toHaveBeenCalledWith(
      { op: "eq", left: ApiKeyUsageTable.apiKeyId, right: "k1" },
      { op: "eq", left: ApiKeyUsageTable.userId, right: "u1" },
    );
    expect(mocks.drizzle.desc).toHaveBeenCalledWith(ApiKeyUsageTable.createdAt);
    expect(mocks.selectChain.limit).toHaveBeenCalledWith(25);
  });

  it("summarizes usage by day route method and status", async () => {
    const rows = [
      {
        day: "2026-06-01",
        route: "/api/v1/threads",
        method: "GET",
        status: 200,
        requests: 3,
        costUnits: 3,
      },
    ];
    mocks.selectChain.where.mockImplementationOnce(() => mocks.selectChain);
    mocks.selectChain.orderBy.mockResolvedValueOnce(rows);

    const result = await apiUsageRepository.summarizeApiKeyUsage("k1", "u1", 7);

    expect(result).toEqual(rows);
    expect(mocks.db.select).toHaveBeenCalledWith(
      expect.objectContaining({
        day: expect.objectContaining({ op: "sql" }),
        route: ApiKeyUsageTable.route,
        method: ApiKeyUsageTable.method,
        status: ApiKeyUsageTable.status,
        requests: expect.objectContaining({ op: "sql" }),
        costUnits: expect.objectContaining({ op: "sql" }),
      }),
    );
    expect(mocks.drizzle.gte).toHaveBeenCalledWith(
      ApiKeyUsageTable.createdAt,
      expect.any(Date),
    );
    expect(mocks.selectChain.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ op: "sql" }),
      ApiKeyUsageTable.route,
      ApiKeyUsageTable.method,
      ApiKeyUsageTable.status,
    );
  });

  it("increments a rate-limit bucket with an upsert", async () => {
    const resetAt = new Date("2026-06-01T00:01:00Z");
    const row = { id: "b1", key: "api_key:k1:minute", count: 2, resetAt };
    mocks.insertChain.returning.mockResolvedValueOnce([row]);

    const result = await apiUsageRepository.incrementRateLimitBucket(
      "api_key:k1:minute",
      resetAt,
    );

    expect(result).toEqual(row);
    expect(mocks.db.insert).toHaveBeenCalledWith(ApiRateLimitBucketTable);
    expect(mocks.insertChain.values).toHaveBeenCalledWith({
      key: "api_key:k1:minute",
      count: 1,
      resetAt,
    });
    expect(mocks.insertChain.onConflictDoUpdate).toHaveBeenCalledWith({
      target: ApiRateLimitBucketTable.key,
      set: expect.objectContaining({
        count: expect.objectContaining({ op: "sql" }),
        resetAt,
        updatedAt: expect.any(Date),
      }),
    });
  });

  it("gets a rate-limit bucket by key", async () => {
    const row = { id: "b1", key: "api_key:k1:minute", count: 2 };
    mocks.selectChain.where.mockResolvedValueOnce([row]);

    const result =
      await apiUsageRepository.getRateLimitBucket("api_key:k1:minute");

    expect(result).toEqual(row);
    expect(mocks.selectChain.from).toHaveBeenCalledWith(
      ApiRateLimitBucketTable,
    );
    expect(mocks.selectChain.where).toHaveBeenCalledWith({
      op: "eq",
      left: ApiRateLimitBucketTable.key,
      right: "api_key:k1:minute",
    });
  });

  it("returns null when a rate-limit bucket is missing", async () => {
    mocks.selectChain.where.mockResolvedValueOnce([]);

    const result = await apiUsageRepository.getRateLimitBucket("missing");

    expect(result).toBeNull();
  });

  it("clears expired rate-limit buckets and returns deleted count", async () => {
    mocks.deleteChain.returning.mockResolvedValueOnce([
      { id: "b1" },
      { id: "b2" },
    ]);

    const count = await apiUsageRepository.clearExpiredRateLimitBuckets(
      new Date("2026-06-01T00:00:00Z"),
    );

    expect(count).toBe(2);
    expect(mocks.deleteChain.where).toHaveBeenCalledWith({
      op: "lte",
      left: ApiRateLimitBucketTable.resetAt,
      right: new Date("2026-06-01T00:00:00Z"),
    });
    expect(mocks.deleteChain.returning).toHaveBeenCalledWith({
      id: ApiRateLimitBucketTable.id,
    });
  });
});
