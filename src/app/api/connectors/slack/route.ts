import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

const SLACK_API = "https://slack.com/api";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list_channels";
    const channelId = searchParams.get("channelId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "slack"),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].isConnected) {
      return NextResponse.json(
        { error: "Slack is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshConnectorToken("slack", rows[0]);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Slack authentication expired. Please reconnect." },
        { status: 401 },
      );
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    if (action === "list_messages") {
      if (!channelId) {
        return NextResponse.json(
          { error: "channelId is required" },
          { status: 400 },
        );
      }
      const res = await fetch(
        `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
        { headers },
      );
      const data = await res.json();
      if (!data.ok) {
        return NextResponse.json(
          { error: data.error || "Failed to list messages" },
          { status: 500 },
        );
      }
      return NextResponse.json({
        messages: (data.messages as any[]).map((m) => ({
          ts: m.ts,
          user: m.user,
          text: m.text,
          thread_ts: m.thread_ts,
        })),
      });
    }

    // Default: list_channels.
    const res = await fetch(
      `${SLACK_API}/conversations.list?limit=${limit}&exclude_archived=true&types=public_channel,private_channel`,
      { headers },
    );
    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to list channels" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      channels: (data.channels as any[]).map((c) => ({
        id: c.id,
        name: c.name,
        is_private: c.is_private,
        is_member: c.is_member,
      })),
    });
  } catch (error) {
    console.error("Slack API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Slack request failed",
      },
      { status: 500 },
    );
  }
}
