import {
  BasicUserWithLastLogin,
  User,
  UserPreferences,
  UserRepository,
} from "app-types/user";
import { pgDb as db, pgDb } from "../db.pg";
import {
  AccountTable,
  ChatMessageTable,
  ChatThreadTable,
  SessionTable,
  UserTable,
} from "../schema.pg";
import { count, desc, eq, getTableColumns, sql } from "drizzle-orm";

// Helper function to get user columns without password
const getUserColumnsWithoutPassword = () => {
  const { password, ...userColumns } = getTableColumns(UserTable);
  return userColumns;
};

export const pgUserRepository: UserRepository = {
  existsByEmail: async (email: string): Promise<boolean> => {
    const result = await db
      .select()
      .from(UserTable)
      .where(eq(UserTable.email, email));
    return result.length > 0;
  },
  updateUserDetails: async ({
    userId,
    name,
    image,
    email,
  }: {
    userId: string;
    name?: string;
    image?: string;
    email?: string;
  }): Promise<User> => {
    const [result] = await db
      .update(UserTable)
      .set({
        ...(name && { name }),
        ...(image && { image }),
        ...(email && { email }),
        updatedAt: new Date(),
      })
      .where(eq(UserTable.id, userId))
      .returning();
    return {
      ...result,
      preferences: result.preferences,
    };
  },

  updatePreferences: async (
    userId: string,
    preferences: UserPreferences,
  ): Promise<User> => {
    const [result] = await db
      .update(UserTable)
      .set({
        preferences,
        updatedAt: new Date(),
      })
      .where(eq(UserTable.id, userId))
      .returning();
    return {
      ...result,
      preferences: result.preferences ?? null,
    };
  },
  getPreferences: async (userId: string) => {
    const [result] = await db
      .select({ preferences: UserTable.preferences })
      .from(UserTable)
      .where(eq(UserTable.id, userId));
    return result?.preferences ?? null;
  },
  getUserById: async (
    userId: string,
  ): Promise<BasicUserWithLastLogin | null> => {
    const [result] = await pgDb
      .select({
        ...getUserColumnsWithoutPassword(),
        lastLogin: sql<Date | null>`(
          SELECT MAX(${SessionTable.updatedAt}) 
          FROM ${SessionTable} 
          WHERE ${SessionTable.userId} = ${UserTable.id}
        )`.as("lastLogin"),
      })
      .from(UserTable)
      .where(eq(UserTable.id, userId));

    return result || null;
  },

  getUserCount: async () => {
    const [result] = await db.select({ count: count() }).from(UserTable);
    return result?.count ?? 0;
  },
  getUserStats: async (userId: string) => {
    // Calculate last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Get thread and message counts for the same 30-day period
    const [result] = await db
      .select({
        threadCount: sql<number>`COALESCE(COUNT(DISTINCT ${ChatThreadTable.id}), 0)`,
        messageCount: sql<number>`COALESCE(COUNT(${ChatMessageTable.id}), 0)`,
      })
      .from(ChatThreadTable)
      .leftJoin(
        ChatMessageTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .where(
        sql`${ChatThreadTable.userId} = ${userId} AND ${ChatThreadTable.createdAt} >= ${thirtyDaysAgo}`,
      );

    // Use replace() to strip \u0000 null byte escapes from JSON text before
    // PostgreSQL's ->> operator converts to text. PostgreSQL text type cannot
    // contain \u0000 and will throw error 22P05 if tool results have null bytes.
    let modelStats: {
      model: string;
      messageCount: number;
      totalTokens: number;
    }[] = [];
    try {
      const cleanMetadataJson = sql`replace(${ChatMessageTable.metadata}::text, '\\u0000', '')::json`;
      const numericPattern = "^[0-9]+(\\.[0-9]+)?$";
      const modelExpression = sql<string>`${cleanMetadataJson}->'chatModel'->>'model'`;
      const messageTokensExpression = sql<number>`COALESCE(
        CASE
          WHEN (${cleanMetadataJson}->'usage'->>'totalTokens') ~ ${numericPattern}
          THEN (${cleanMetadataJson}->'usage'->>'totalTokens')::numeric
        END,
        CASE
          WHEN (${cleanMetadataJson}->'usage'->>'total_tokens') ~ ${numericPattern}
          THEN (${cleanMetadataJson}->'usage'->>'total_tokens')::numeric
        END,
        CASE
          WHEN (${cleanMetadataJson}->>'usageTokens') ~ ${numericPattern}
          THEN (${cleanMetadataJson}->>'usageTokens')::numeric
        END,
        (
          COALESCE(
            CASE
              WHEN (${cleanMetadataJson}->'usage'->>'inputTokens') ~ ${numericPattern}
              THEN (${cleanMetadataJson}->'usage'->>'inputTokens')::numeric
            END,
            CASE
              WHEN (${cleanMetadataJson}->'usage'->>'promptTokens') ~ ${numericPattern}
              THEN (${cleanMetadataJson}->'usage'->>'promptTokens')::numeric
            END,
            CASE
              WHEN (${cleanMetadataJson}->'usage'->>'prompt_tokens') ~ ${numericPattern}
              THEN (${cleanMetadataJson}->'usage'->>'prompt_tokens')::numeric
            END,
            0
          ) +
          COALESCE(
            CASE
              WHEN (${cleanMetadataJson}->'usage'->>'outputTokens') ~ ${numericPattern}
              THEN (${cleanMetadataJson}->'usage'->>'outputTokens')::numeric
            END,
            CASE
              WHEN (${cleanMetadataJson}->'usage'->>'completionTokens') ~ ${numericPattern}
              THEN (${cleanMetadataJson}->'usage'->>'completionTokens')::numeric
            END,
            CASE
              WHEN (${cleanMetadataJson}->'usage'->>'completion_tokens') ~ ${numericPattern}
              THEN (${cleanMetadataJson}->'usage'->>'completion_tokens')::numeric
            END,
            0
          )
        ),
        0
      )`;
      const totalTokensExpression = sql<number>`COALESCE(SUM(${messageTokensExpression}), 0)`;

      modelStats = await db
        .select({
          model: modelExpression,
          messageCount: count(ChatMessageTable.id),
          totalTokens: totalTokensExpression,
        })
        .from(ChatMessageTable)
        .leftJoin(
          ChatThreadTable,
          eq(ChatMessageTable.threadId, ChatThreadTable.id),
        )
        .where(
          sql`${ChatThreadTable.userId} = ${userId} 
              AND ${ChatMessageTable.createdAt} >= ${thirtyDaysAgo}
              AND ${ChatMessageTable.metadata} IS NOT NULL
              AND ${modelExpression} IS NOT NULL`,
        )
        .groupBy(modelExpression)
        .orderBy(desc(totalTokensExpression))
        .limit(10);
    } catch (error) {
      console.error("Error fetching model stats for user:", userId, error);
    }

    const totalTokens = modelStats.reduce(
      (acc, curr) => acc + Number(curr.totalTokens || 0),
      0,
    );

    // Get generated image count
    let generatedImageCount = 0;
    try {
      const [imageCountResult] = await db
        .select({ count: count() })
        .from(ChatMessageTable)
        .innerJoin(
          ChatThreadTable,
          eq(ChatMessageTable.threadId, ChatThreadTable.id),
        )
        .where(sql`
          ${ChatThreadTable.userId} = ${userId}
          AND EXISTS (
              SELECT 1 FROM (
                SELECT replace(p::text, '\\u0000', '')::json AS clean_part
                FROM unnest(${ChatMessageTable.parts}) AS p
              ) AS sanitized
              WHERE sanitized.clean_part->>'type' = 'tool-invocation'
              AND sanitized.clean_part->>'toolName' = 'image-manager'
          )
        `);
      generatedImageCount = imageCountResult?.count || 0;
    } catch (error) {
      console.error("Error fetching image count for user:", userId, error);
    }

    return {
      threadCount: result?.threadCount || 0,
      messageCount: result?.messageCount || 0,
      modelStats: modelStats.map((stat) => ({
        ...stat,
        totalTokens: Number(stat.totalTokens || 0),
      })),
      totalTokens,
      generatedImageCount,
      period: "Last 30 Days",
    };
  },
  getUserAuthMethods: async (userId: string) => {
    const accounts = await pgDb
      .select({
        providerId: AccountTable.providerId,
      })
      .from(AccountTable)
      .where(eq(AccountTable.userId, userId));

    return {
      hasPassword: accounts.some((a) => a.providerId === "credential"),
      oauthProviders: accounts
        .filter((a) => a.providerId !== "credential")
        .map((a) => a.providerId),
    };
  },
};
