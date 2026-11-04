import { getSession } from "auth/server";
import { eq } from "drizzle-orm";
import { isProviderConfigured } from "lib/connectors/credentials";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextResponse } from "next/server";

export type ConnectorProvider =
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
  // 42 new providers added 2026-06-03
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

export interface ConnectorInfo {
  provider: ConnectorProvider;
  name: string;
  description: string;
  icon: string;
  isConnected: boolean;
  isAvailable: boolean;
  isPaused: boolean;
  email?: string | null;
  lastSyncAt?: string | null;
}

// Static connector catalog (name/description/icon). `isAvailable` is
// computed at request time so admin-panel credential changes take effect
// without a redeploy.
const CONNECTOR_CATALOG: Omit<
  ConnectorInfo,
  "isConnected" | "isAvailable" | "isPaused"
>[] = [
  {
    provider: "gmail",
    name: "Gmail",
    description: "Read, compose, and reply to emails using AI",
    icon: "gmail",
  },
  {
    provider: "google-drive",
    name: "Google Drive",
    description: "List, read, and create files in your Drive",
    icon: "google-drive",
  },
  {
    provider: "google-calendar",
    name: "Google Calendar",
    description: "View and create calendar events",
    icon: "google-calendar",
  },
  {
    provider: "google-docs",
    name: "Google Docs",
    description: "Create, read, and edit Google Docs documents",
    icon: "google-docs",
  },
  {
    provider: "google-forms",
    name: "Google Forms",
    description: "Create and manage Google Forms",
    icon: "google-forms",
  },
  {
    provider: "google-keep",
    name: "Google Keep",
    description: "Read and create Google Keep notes",
    icon: "google-keep",
  },
  {
    provider: "google-meet",
    name: "Google Meet",
    description: "Manage Google Meet recordings and transcripts",
    icon: "google-meet",
  },
  {
    provider: "google-sheets",
    name: "Google Sheets",
    description: "Create, read, and edit Google Sheets spreadsheets",
    icon: "google-sheets",
  },
  {
    provider: "google-slides",
    name: "Google Slides",
    description: "Create, read, and edit Google Slides presentations",
    icon: "google-slides",
  },
  {
    provider: "google-tasks",
    name: "Google Tasks",
    description: "Read and manage Google Tasks",
    icon: "google-tasks",
  },
  {
    provider: "youtube",
    name: "YouTube",
    description: "Search videos, manage playlists, and analyze channel data",
    icon: "youtube",
  },
  {
    provider: "outlook",
    name: "Outlook",
    description: "Manage your Outlook emails with AI assistance",
    icon: "outlook",
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Send and read Slack messages",
    icon: "slack",
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Access and update your Notion pages",
    icon: "notion",
  },
  {
    provider: "github",
    name: "GitHub",
    description: "Manage issues, PRs, and repositories",
    icon: "github",
  },
  // 42 new connectors added 2026-06-03.
  {
    provider: "confluence",
    name: "Confluence",
    description: "Search and read Confluence pages, spaces, and comments",
    icon: "confluence",
  },
  {
    provider: "jira",
    name: "Jira",
    description: "List projects, search issues, add comments",
    icon: "jira",
  },
  {
    provider: "linear",
    name: "Linear",
    description: "List teams, read and create Linear issues",
    icon: "linear",
  },
  {
    provider: "asana",
    name: "Asana",
    description: "List workspaces, projects, and tasks",
    icon: "asana",
  },
  {
    provider: "clickup",
    name: "ClickUp",
    description: "Spaces, lists, and tasks",
    icon: "clickup",
  },
  {
    provider: "productboard",
    name: "Productboard",
    description: "Products and features",
    icon: "productboard",
  },
  {
    provider: "testrail",
    name: "TestRail",
    description: "Test cases, runs, and results",
    icon: "testrail",
  },
  {
    provider: "coda",
    name: "Coda",
    description: "Docs, tables, and rows",
    icon: "coda",
  },
  {
    provider: "outline",
    name: "Outline",
    description: "Knowledge-base documents and collections",
    icon: "outline",
  },
  {
    provider: "slab",
    name: "Slab",
    description: "Team wiki posts and topics",
    icon: "slab",
  },
  {
    provider: "guru",
    name: "Guru",
    description: "Cards and collections",
    icon: "guru",
  },
  {
    provider: "highspot",
    name: "Highspot",
    description: "Sales enablement content and spots",
    icon: "highspot",
  },
  {
    provider: "document360",
    name: "Document360",
    description: "Knowledge base articles and categories",
    icon: "document360",
  },
  {
    provider: "gitlab",
    name: "GitLab",
    description: "Projects, issues, and merge requests",
    icon: "gitlab",
  },
  {
    provider: "bitbucket",
    name: "Bitbucket",
    description: "Repos, issues, and pull requests",
    icon: "bitbucket",
  },
  {
    provider: "dropbox",
    name: "Dropbox",
    description: "List, read, and search Dropbox files",
    icon: "dropbox",
  },
  {
    provider: "zendesk",
    name: "Zendesk",
    description: "List, search, and reply to tickets",
    icon: "zendesk",
  },
  {
    provider: "freshdesk",
    name: "Freshdesk",
    description: "Tickets and replies",
    icon: "freshdesk",
  },
  {
    provider: "salesforce",
    name: "Salesforce",
    description: "Accounts, opportunities, and SOQL queries",
    icon: "salesforce",
  },
  {
    provider: "hubspot",
    name: "HubSpot",
    description: "Contacts, deals, and CRM records",
    icon: "hubspot",
  },
  {
    provider: "airtable",
    name: "Airtable",
    description: "Bases, tables, and records",
    icon: "airtable",
  },
  {
    provider: "gong",
    name: "Gong",
    description: "Call recordings and transcripts",
    icon: "gong",
  },
  {
    provider: "egnyte",
    name: "Egnyte",
    description: "Folders, files, and search",
    icon: "egnyte",
  },
  {
    provider: "teams",
    name: "Microsoft Teams",
    description: "Chat messages and conversations",
    icon: "teams",
  },
  {
    provider: "discord",
    name: "Discord",
    description: "Guilds, channels, and messages",
    icon: "discord",
  },
  {
    provider: "bookstack",
    name: "BookStack",
    description: "Books, chapters, and pages (server-token)",
    icon: "bookstack",
  },
  {
    provider: "gitbook",
    name: "GitBook",
    description: "Spaces and pages (server-token)",
    icon: "gitbook",
  },
  {
    provider: "canvas",
    name: "Canvas LMS",
    description: "Courses, assignments, and quizzes (server-token)",
    icon: "canvas-lms",
  },
  {
    provider: "loopio",
    name: "Loopio",
    description: "Sales answer entries and search (server-token)",
    icon: "loopio",
  },
  {
    provider: "discourse",
    name: "Discourse",
    description: "Forum topics and posts (server-token)",
    icon: "discourse",
  },
  {
    provider: "xenforo",
    name: "XenForo",
    description: "Forums, threads, and posts (server-token)",
    icon: "xenforo",
  },
  {
    provider: "drupal-wiki",
    name: "Drupal Wiki",
    description: "Drupal nodes and search (server-token)",
    icon: "drupal-wiki",
  },
  {
    provider: "axero",
    name: "Axero",
    description: "Intranet spaces and content (server-token)",
    icon: "axero",
  },
  {
    provider: "zulip",
    name: "Zulip",
    description: "Streams, topics, and messages (server-token)",
    icon: "zulip",
  },
  {
    provider: "mediawiki",
    name: "MediaWiki",
    description: "Any MediaWiki-based wiki (server-token)",
    icon: "mediawiki",
  },
  {
    provider: "fireflies",
    name: "Fireflies",
    description: "Meeting transcripts and summaries (server-token)",
    icon: "fireflies",
  },
  {
    provider: "wikipedia",
    name: "Wikipedia",
    description: "Search and read Wikipedia articles (no auth)",
    icon: "wikipedia",
  },
];

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connectedRows = await db
      .select({
        provider: UserConnectorTable.provider,
        email: UserConnectorTable.email,
        isConnected: UserConnectorTable.isConnected,
        isPaused: UserConnectorTable.isPaused,
        lastSyncAt: UserConnectorTable.lastSyncAt,
      })
      .from(UserConnectorTable)
      .where(eq(UserConnectorTable.userId, session.user.id));

    const connectedByProvider = new Map(
      connectedRows.map((row) => [row.provider, row]),
    );

    // Compute availability in parallel (each call hits the 5s-cached admin
    // config or env vars, so the cost is one round-trip per provider).
    // Existing connected rows remain available even if the OAuth client env was
    // later cleared; otherwise the UI hides a working connection as "Coming soon".
    const availability = await Promise.all(
      CONNECTOR_CATALOG.map((c) => isProviderConfigured(c.provider)),
    );

    const connectors: ConnectorInfo[] = CONNECTOR_CATALOG.map((c, i) => {
      const connected = connectedByProvider.get(c.provider);
      const isConnected = connected?.isConnected ?? false;
      return {
        ...c,
        isConnected,
        isPaused: connected?.isPaused ?? false,
        isAvailable: availability[i] || isConnected,
        email: connected?.email ?? null,
        lastSyncAt: connected?.lastSyncAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ connectors });
  } catch (error) {
    console.error("Error fetching connectors:", error);
    return NextResponse.json(
      { error: "Failed to fetch connectors" },
      { status: 500 },
    );
  }
}
