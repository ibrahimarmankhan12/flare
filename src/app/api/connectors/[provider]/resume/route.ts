import "server-only";

import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest, NextResponse } from "next/server";

type PauseableProvider =
  | "gmail"
  | "google-drive"
  | "google-calendar"
  | "outlook"
  | "slack"
  | "notion"
  | "github";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await params;
    const providerTyped = provider as PauseableProvider;

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, providerTyped),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Connector not found" },
        { status: 404 },
      );
    }

    // Resume: clear isPaused. isConnected remains true so no re-OAuth needed.
    await db
      .update(UserConnectorTable)
      .set({
        isPaused: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, providerTyped),
        ),
      );

    return NextResponse.json({ success: true, status: "resumed" });
  } catch (error) {
    console.error("Error resuming connector:", error);
    return NextResponse.json(
      { error: "Failed to resume connector" },
      { status: 500 },
    );
  }
}
