import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { revokeConnectorToken } from "lib/connectors/refresh";

type ProviderType =
  | "gmail"
  | "google-drive"
  | "google-calendar"
  | "google-docs"
  | "google-forms"
  | "google-keep"
  | "google-meet"
  | "google-sheets"
  | "google-slides"
  | "google-tasks"
  | "youtube"
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

const SUPPORTED: ReadonlySet<ProviderType> = new Set([
  "gmail",
  "google-drive",
  "google-calendar",
  "google-docs",
  "google-forms",
  "google-keep",
  "google-meet",
  "google-sheets",
  "google-slides",
  "google-tasks",
  "youtube",
  "outlook",
  "slack",
  "notion",
  "github",
  "confluence",
  "jira",
  "linear",
  "asana",
  "clickup",
  "productboard",
  "testrail",
  "coda",
  "outline",
  "slab",
  "guru",
  "highspot",
  "document360",
  "gitlab",
  "bitbucket",
  "dropbox",
  "zendesk",
  "freshdesk",
  "salesforce",
  "hubspot",
  "airtable",
  "gong",
  "egnyte",
  "teams",
  "discord",
  "bookstack",
  "gitbook",
  "canvas",
  "loopio",
  "discourse",
  "xenforo",
  "drupal-wiki",
  "axero",
  "zulip",
  "mediawiki",
  "fireflies",
  "wikipedia",
]);

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
    if (!SUPPORTED.has(provider as ProviderType)) {
      return NextResponse.json(
        { error: `Unknown provider: ${provider}` },
        { status: 400 },
      );
    }
    const providerTyped = provider as ProviderType;

    // Get the connector to revoke the token
    const connector = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, providerTyped),
        ),
      )
      .limit(1);

    if (connector.length > 0 && connector[0].accessToken) {
      // Best-effort revoke. `revokeConnectorToken` is a no-op for Notion
      // (no public revoke endpoint) and never throws for other providers.
      await revokeConnectorToken(providerTyped, connector[0].accessToken);
    }

    // Update the connector to disconnected state (keep record but clear tokens)
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
          eq(UserConnectorTable.provider, providerTyped),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting connector:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 },
    );
  }
}
