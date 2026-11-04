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
  | "github"
  | "confluence"
  | "jira"
  | "linear"
  | "asana"
  | "clickup"
  | "productboard"
  | "testrail"
  | "coda"
  | "outline"
  | "slab"
  | "guru"
  | "highspot"
  | "document360"
  | "gitlab"
  | "bitbucket"
  | "dropbox"
  | "zendesk"
  | "freshdesk"
  | "salesforce"
  | "hubspot"
  | "airtable"
  | "gong"
  | "egnyte"
  | "teams"
  | "discord"
  | "bookstack"
  | "gitbook"
  | "canvas"
  | "loopio"
  | "discourse"
  | "xenforo"
  | "drupal-wiki"
  | "axero"
  | "zulip"
  | "mediawiki"
  | "fireflies"
  | "wikipedia";

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

    const currentlyPaused = rows[0].isPaused ?? false;

    // Toggle: pause when not paused, resume when paused.
    // isConnected stays true so tokens are preserved for both states.
    await db
      .update(UserConnectorTable)
      .set({
        isPaused: !currentlyPaused,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, providerTyped),
        ),
      );

    return NextResponse.json({
      success: true,
      status: currentlyPaused ? "resumed" : "paused",
    });
  } catch (error) {
    console.error("Error toggling connector pause:", error);
    return NextResponse.json(
      { error: "Failed to toggle connector pause state" },
      { status: 500 },
    );
  }
}
