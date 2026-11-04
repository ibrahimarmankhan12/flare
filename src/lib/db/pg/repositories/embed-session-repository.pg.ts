import "server-only";

import { SubscriptionTierName } from "app-types/subscription";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { EmbedSession, EmbedSessionTable, NewEmbedSession } from "../schema.pg";

export interface CreateEmbedSessionInput {
  agentId: string;
  userId?: string | null;
  anonymousToken: string;
  rateLimitTier?: SubscriptionTierName;
  expiresAt: Date;
  firstMessageCaptchaAt?: Date | null;
}

export const embedSessionRepository = {
  async createEmbedSession(
    input: CreateEmbedSessionInput,
  ): Promise<EmbedSession> {
    const [row] = await db
      .insert(EmbedSessionTable)
      .values({
        agentId: input.agentId,
        userId: input.userId ?? null,
        anonymousToken: input.anonymousToken,
        rateLimitTier: input.rateLimitTier ?? "free",
        expiresAt: input.expiresAt,
        firstMessageCaptchaAt: input.firstMessageCaptchaAt ?? null,
      } satisfies NewEmbedSession)
      .returning();
    return row as EmbedSession;
  },

  async getEmbedSessionByToken(token: string): Promise<EmbedSession | null> {
    const [row] = await db
      .select()
      .from(EmbedSessionTable)
      .where(eq(EmbedSessionTable.anonymousToken, token));
    return (row as EmbedSession | undefined) ?? null;
  },

  async getEmbedSession(id: string): Promise<EmbedSession | null> {
    const [row] = await db
      .select()
      .from(EmbedSessionTable)
      .where(eq(EmbedSessionTable.id, id));
    return (row as EmbedSession | undefined) ?? null;
  },

  async revokeEmbedSession(
    id: string,
    userId?: string,
  ): Promise<EmbedSession | null> {
    const where = userId
      ? and(eq(EmbedSessionTable.id, id), eq(EmbedSessionTable.userId, userId))
      : eq(EmbedSessionTable.id, id);
    const [row] = await db
      .update(EmbedSessionTable)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(where)
      .returning();
    return (row as EmbedSession | undefined) ?? null;
  },

  async incrementDailyMessageCount(id: string): Promise<EmbedSession | null> {
    const [row] = await db
      .update(EmbedSessionTable)
      .set({
        dailyMessageCount: sql`${EmbedSessionTable.dailyMessageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(EmbedSessionTable.id, id))
      .returning();
    return (row as EmbedSession | undefined) ?? null;
  },

  async resetDailyCountIfNeeded(
    id: string,
    now: Date,
  ): Promise<EmbedSession | null> {
    const [row] = await db
      .update(EmbedSessionTable)
      .set({
        dailyMessageCount: 0,
        dailyResetAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(EmbedSessionTable.id, id),
          lte(EmbedSessionTable.dailyResetAt, now),
        ),
      )
      .returning();
    return (row as EmbedSession | undefined) ?? null;
  },

  async listEmbedSessionsForAgent(
    agentId: string,
    userId: string,
  ): Promise<EmbedSession[]> {
    return (await db
      .select()
      .from(EmbedSessionTable)
      .where(
        and(
          eq(EmbedSessionTable.agentId, agentId),
          eq(EmbedSessionTable.userId, userId),
          isNull(EmbedSessionTable.revokedAt),
        ),
      )
      .orderBy(desc(EmbedSessionTable.createdAt))) as EmbedSession[];
  },
};
