import { NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";

export async function POST() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Notion does not expose a public token-revoke endpoint; the user must
    // remove the integration from their workspace settings. We just clear
    // the local tokens so the connector stops being usable from this app.
    await db
      .update(UserConnectorTable)
      .set({
        isConnected: false,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "notion"),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Notion:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Notion" },
      { status: 500 },
    );
  }
}
