import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { getSession } from "auth/server";
import { getTokenProviderToken } from "lib/connectors/credentials";

/**
 * Generic connect route for token-only providers. Token-only providers
 * don't need an OAuth flow — the API token lives in server env, and a
 * per-user row in `user_connector` simply records which users have
 * opted in to using it.
 *
 * Provider id is in the URL path: `/api/connectors/<provider>/token-connect`.
 * The provider is the same string as the `user_connector.provider` column.
 */
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
    const token = getTokenProviderToken(provider as any);
    if (!token) {
      return NextResponse.json(
        {
          error: `${provider} is not configured server-side. Set the required env var.`,
        },
        { status: 400 },
      );
    }

    await db
      .insert(UserConnectorTable)
      .values({
        userId: session.user.id,
        provider: provider as any,
        // The access token is the server-side env var; we don't store it
        // per-user (it's the same for everyone). Storing a synthetic
        // marker means the row is "configured" but the real token is
        // read from env at call time.
        accessToken: "server-token",
        isConnected: true,
        lastSyncAt: new Date(),
        metadata: { source: "server-token" },
      })
      .onConflictDoUpdate({
        target: [UserConnectorTable.userId, UserConnectorTable.provider],
        set: {
          isConnected: true,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Token-only connect error:", error);
    return NextResponse.json(
      { error: "Failed to connect" },
      { status: 500 },
    );
  }
}
