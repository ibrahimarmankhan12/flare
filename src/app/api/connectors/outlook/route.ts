import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

const GRAPH = "https://graph.microsoft.com/v1.0";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "inbox";
    const messageId = searchParams.get("messageId");
    const top = Math.min(parseInt(searchParams.get("top") || "10"), 25);

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "outlook"),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].isConnected) {
      return NextResponse.json(
        { error: "Outlook is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshConnectorToken("outlook", rows[0]);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Outlook authentication expired. Please reconnect." },
        { status: 401 },
      );
    }

    if (action === "read" && messageId) {
      const res = await fetch(
        `${GRAPH}/me/messages/${encodeURIComponent(messageId)}?$select=subject,from,toRecipients,receivedDateTime,bodyPreview,body`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to fetch message" },
          { status: 500 },
        );
      }
      const message = await res.json();
      return NextResponse.json({ message });
    }

    // Default: inbox.
    const res = await fetch(
      `${GRAPH}/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch inbox" },
        { status: 500 },
      );
    }
    const data = await res.json();
    return NextResponse.json({ messages: data.value || [] });
  } catch (error) {
    console.error("Outlook API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Outlook request failed",
      },
      { status: 500 },
    );
  }
}
