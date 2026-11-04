import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  ApiKeyUsage,
  ApiKeyUsageTable,
  ApiRateLimitBucket,
  ApiRateLimitBucketTable,
  NewApiKeyUsage,
  NewApiRateLimitBucket,
} from "../schema.pg";

export interface RecordApiKeyUsageInput {
  apiKeyId: string;
  userId: string;
  route: string;
  method: string;
  status: number;
  costUnits?: number;
}

export interface ApiKeyUsageSummaryRow {
  day: string;
  route: string;
  method: string;
  status: number;
  requests: number;
  costUnits: number;
}

export const apiUsageRepository = {
  async recordApiKeyUsage(input: RecordApiKeyUsageInput): Promise<ApiKeyUsage> {
    const [row] = await db
      .insert(ApiKeyUsageTable)
      .values({
        apiKeyId: input.apiKeyId,
        userId: input.userId,
        route: input.route,
        method: input.method,
        status: input.status,
        costUnits: input.costUnits ?? 1,
      } satisfies NewApiKeyUsage)
      .returning();
    return row as ApiKeyUsage;
  },

  async listApiKeyUsage(
    apiKeyId: string,
    userId: string,
    limit: number,
  ): Promise<ApiKeyUsage[]> {
    return (await db
      .select()
      .from(ApiKeyUsageTable)
      .where(
        and(
          eq(ApiKeyUsageTable.apiKeyId, apiKeyId),
          eq(ApiKeyUsageTable.userId, userId),
        ),
      )
      .orderBy(desc(ApiKeyUsageTable.createdAt))
      .limit(limit)) as ApiKeyUsage[];
  },

  async summarizeApiKeyUsage(
    apiKeyId: string,
    userId: string,
    days: number,
  ): Promise<ApiKeyUsageSummaryRow[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return (await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${ApiKeyUsageTable.createdAt}), 'YYYY-MM-DD')`,
        route: ApiKeyUsageTable.route,
        method: ApiKeyUsageTable.method,
        status: ApiKeyUsageTable.status,
        requests: sql<number>`count(*)::int`,
        costUnits: sql<number>`coalesce(sum(${ApiKeyUsageTable.costUnits}), 0)::int`,
      })
      .from(ApiKeyUsageTable)
      .where(
        and(
          eq(ApiKeyUsageTable.apiKeyId, apiKeyId),
          eq(ApiKeyUsageTable.userId, userId),
          gte(ApiKeyUsageTable.createdAt, since),
        ),
      )
      .groupBy(
        sql`date_trunc('day', ${ApiKeyUsageTable.createdAt})`,
        ApiKeyUsageTable.route,
        ApiKeyUsageTable.method,
        ApiKeyUsageTable.status,
      )
      .orderBy(
        sql`date_trunc('day', ${ApiKeyUsageTable.createdAt}) DESC`,
      )) as ApiKeyUsageSummaryRow[];
  },

  async incrementRateLimitBucket(
    key: string,
    resetAt: Date,
  ): Promise<ApiRateLimitBucket> {
    const [row] = await db
      .insert(ApiRateLimitBucketTable)
      .values({
        key,
        count: 1,
        resetAt,
      } satisfies NewApiRateLimitBucket)
      .onConflictDoUpdate({
        target: ApiRateLimitBucketTable.key,
        set: {
          count: sql`${ApiRateLimitBucketTable.count} + 1`,
          resetAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row as ApiRateLimitBucket;
  },

  async getRateLimitBucket(key: string): Promise<ApiRateLimitBucket | null> {
    const [row] = await db
      .select()
      .from(ApiRateLimitBucketTable)
      .where(eq(ApiRateLimitBucketTable.key, key));
    return (row as ApiRateLimitBucket | undefined) ?? null;
  },

  async clearExpiredRateLimitBuckets(now: Date): Promise<number> {
    const rows = await db
      .delete(ApiRateLimitBucketTable)
      .where(lte(ApiRateLimitBucketTable.resetAt, now))
      .returning({ id: ApiRateLimitBucketTable.id });
    return rows.length;
  },
};
