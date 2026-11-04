import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "search";
    const pageId = searchParams.get("pageId");
    const query = searchParams.get("q") || "";

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "notion"),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].isConnected) {
      return NextResponse.json(
        { error: "Notion is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshConnectorToken("notion", rows[0]);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Notion authentication expired. Please reconnect." },
        { status: 401 },
      );
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };

    if (action === "read_page" && pageId) {
      const pageRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
        headers,
      });
      if (!pageRes.ok) {
        return NextResponse.json(
          { error: "Failed to fetch page" },
          { status: 500 },
        );
      }
      const page = await pageRes.json();

      // Also fetch the page's block children to provide the body content.
      const blocksRes = await fetch(
        `${NOTION_API}/blocks/${pageId}/children?page_size=50`,
        { headers },
      );
      const blocks = blocksRes.ok
        ? (await blocksRes.json()).results
        : [];

      return NextResponse.json({ page, blocks });
    }

    // Default: search.
    const searchRes = await fetch(`${NOTION_API}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        page_size: 20,
        filter: { value: "page", property: "object" },
      }),
    });
    if (!searchRes.ok) {
      return NextResponse.json(
        { error: "Failed to search Notion" },
        { status: 500 },
      );
    }
    const data = await searchRes.json();
    return NextResponse.json({
      results: (data.results as any[]).map((r) => ({
        id: r.id,
        object: r.object,
        title:
          r.properties?.title?.title?.[0]?.plain_text ||
          r.properties?.Name?.title?.[0]?.plain_text ||
          "(untitled)",
        url: r.url,
        last_edited_time: r.last_edited_time,
      })),
    });
  } catch (error) {
    console.error("Notion API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Notion request failed",
      },
      { status: 500 },
    );
  }
}
