import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";
    const eventId = searchParams.get("eventId");
    const maxResults = parseInt(searchParams.get("maxResults") || "10");

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "google-calendar"),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].isConnected) {
      return NextResponse.json(
        { error: "Google Calendar is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshConnectorToken(
      "google-calendar",
      rows[0],
    );
    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Calendar authentication expired. Please reconnect." },
        { status: 401 },
      );
    }

    if (action === "get" && eventId) {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/events/${encodeURIComponent(eventId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to fetch event" },
          { status: 500 },
        );
      }
      const event = await res.json();
      return NextResponse.json({ event });
    }

    // Default: list upcoming events.
    const now = new Date().toISOString();
    const listRes = await fetch(
      `https://www.googleapis.com/calendar/v3/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) {
      return NextResponse.json(
        { error: "Failed to list events" },
        { status: 500 },
      );
    }
    const data = await listRes.json();
    return NextResponse.json({ events: data.items || [] });
  } catch (error) {
    console.error("Calendar API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Calendar request failed",
      },
      { status: 500 },
    );
  }
}
