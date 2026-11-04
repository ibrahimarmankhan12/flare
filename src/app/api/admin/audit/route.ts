import "server-only";
import { NextResponse } from "next/server";
import { siteConfigRepository } from "lib/db/repository";
import { requireAdminPermission } from "lib/auth/permissions";
import { pgDb } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import { inArray } from "drizzle-orm";

export async function GET() {
  try {
    await requireAdminPermission("access audit log");

    const entries = await siteConfigRepository.getAuditLog(50);

    // Resolve user emails for all changedBy IDs
    const userIds = [...new Set(entries.map((e) => e.changedBy))];
    let userEmailMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const users = await pgDb
        .select({ id: UserTable.id, email: UserTable.email })
        .from(UserTable)
        .where(inArray(UserTable.id, userIds));

      userEmailMap = Object.fromEntries(users.map((u) => [u.id, u.email]));
    }

    const entriesWithEmail = entries.map((entry) => ({
      ...entry,
      userEmail: userEmailMap[entry.changedBy] ?? null,
      changedAt: entry.changedAt instanceof Date
        ? entry.changedAt.toISOString()
        : String(entry.changedAt),
    }));

    return NextResponse.json({ success: true, entries: entriesWithEmail });
  } catch (e) {
    console.error("[audit/GET] error:", e);
    return NextResponse.json(
      { success: false, error: "Failed to load audit log" },
      { status: 500 },
    );
  }
}