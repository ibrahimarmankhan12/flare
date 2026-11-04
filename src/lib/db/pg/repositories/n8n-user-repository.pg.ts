import { eq } from "drizzle-orm";
import { pgDb } from "../db.pg";
import { N8nUserTable } from "../schema.pg";

export type N8nUserRecord = {
  id: string;
  userId: string;
  n8nUserId: string;
  apiKey: string;
  email?: string | null;
  password?: string | null;
};

export const pgN8nUserRepository = {
  async findByUserId(userId: string): Promise<N8nUserRecord | null> {
    const rows = await pgDb
      .select()
      .from(N8nUserTable)
      .where(eq(N8nUserTable.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  },
  async save(record: {
    userId: string;
    n8nUserId: string;
    apiKey: string;
    email?: string;
    password?: string;
  }): Promise<N8nUserRecord> {
    const rows = await pgDb
      .insert(N8nUserTable)
      .values(record)
      .onConflictDoNothing({ target: N8nUserTable.userId })
      .returning();
    return rows[0];
  },
};