import { NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { revokeConnectorToken } from "lib/connectors/refresh";

export async function POST() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connector = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "outlook"),
        ),
      )
      .limit(1);

    if (connector.length > 0 && connector[0].accessToken) {
      await revokeConnectorToken("outlook", connector[0].accessToken);
    }

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
          eq(UserConnectorTable.provider, "outlook"),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Outlook:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Outlook" },
      { status: 500 },
    );
  }
}
