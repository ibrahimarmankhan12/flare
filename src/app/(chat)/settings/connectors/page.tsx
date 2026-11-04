import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getSession } from "lib/auth/server";
import { isProviderConfigured } from "lib/connectors/credentials";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";

import { ConnectorsSettingsView, type ConnectorViewModel, type ConnectorProvider } from "./connectors-settings-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connectors — Flare AI",
  description: "Manage your connected data sources and sync state.",
};

const CATALOG: Array<{
  provider: ConnectorProvider;
  name: string;
  description: string;
  category: ConnectorViewModel["category"];
}> = [
  {
    provider: "gmail",
    name: "Gmail",
    description: "Read, compose, and reply to emails using AI",
    category: "Google",
  },
  {
    provider: "google-drive",
    name: "Google Drive",
    description: "List, read, and create files in your Drive",
    category: "Google",
  },
  {
    provider: "google-calendar",
    name: "Google Calendar",
    description: "View and create calendar events",
    category: "Google",
  },
  {
    provider: "outlook",
    name: "Outlook",
    description: "Manage your Outlook emails with AI assistance",
    category: "Microsoft",
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Send and read Slack messages",
    category: "Workspace",
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Access and update your Notion pages",
    category: "Workspace",
  },
  {
    provider: "github",
    name: "GitHub",
    description: "Manage issues, PRs, and repositories",
    category: "Code",
  },
  // 42 new providers (added 2026-06-03)
  {
    provider: "confluence",
    name: "Confluence",
    description: "Search and read Confluence pages, spaces, and comments",
    category: "Atlassian",
  },
  {
    provider: "jira",
    name: "Jira",
    description: "List Jira projects, search issues, and add comments",
    category: "Atlassian",
  },
  {
    provider: "linear",
    name: "Linear",
    description: "List Linear teams, read and create issues",
    category: "Trackers",
  },
  {
    provider: "asana",
    name: "Asana",
    description: "List Asana workspaces, projects, and tasks",
    category: "Trackers",
  },
  {
    provider: "clickup",
    name: "ClickUp",
    description: "Spaces, lists, and tasks in ClickUp",
    category: "Trackers",
  },
  {
    provider: "productboard",
    name: "Productboard",
    description: "Read Productboard products and features",
    category: "Trackers",
  },
  {
    provider: "testrail",
    name: "TestRail",
    description: "Test cases, runs, and results (server-token)",
    category: "Trackers",
  },
  {
    provider: "coda",
    name: "Coda",
    description: "List Coda docs, tables, and rows",
    category: "Docs",
  },
  {
    provider: "outline",
    name: "Outline",
    description: "Search Outline knowledge-base documents",
    category: "Docs",
  },
  {
    provider: "slab",
    name: "Slab",
    description: "Read Slab team-wiki posts and topics",
    category: "Docs",
  },
  {
    provider: "guru",
    name: "Guru",
    description: "Search Guru cards and collections",
    category: "Docs",
  },
  {
    provider: "highspot",
    name: "Highspot",
    description: "Browse Highspot sales-enablement content",
    category: "Docs",
  },
  {
    provider: "document360",
    name: "Document360",
    description: "Read Document360 knowledge-base articles (server-token)",
    category: "Docs",
  },
  {
    provider: "gitlab",
    name: "GitLab",
    description: "List GitLab projects, issues, and merge requests",
    category: "Code",
  },
  {
    provider: "bitbucket",
    name: "Bitbucket",
    description: "List Bitbucket repos, issues, and pull requests",
    category: "Code",
  },
  {
    provider: "dropbox",
    name: "Dropbox",
    description: "List, read, and search Dropbox files",
    category: "Storage",
  },
  {
    provider: "egnyte",
    name: "Egnyte",
    description: "Browse Egnyte folders, files, and search",
    category: "Storage",
  },
  {
    provider: "zendesk",
    name: "Zendesk",
    description: "List, search, and reply to Zendesk tickets",
    category: "Support",
  },
  {
    provider: "freshdesk",
    name: "Freshdesk",
    description: "List and reply to Freshdesk tickets",
    category: "Support",
  },
  {
    provider: "salesforce",
    name: "Salesforce",
    description: "Query Salesforce accounts, opportunities, and SOQL",
    category: "Support",
  },
  {
    provider: "hubspot",
    name: "HubSpot",
    description: "Read HubSpot contacts, deals, and CRM records",
    category: "Support",
  },
  {
    provider: "airtable",
    name: "Airtable",
    description: "List Airtable bases, tables, and records",
    category: "Support",
  },
  {
    provider: "gong",
    name: "Gong",
    description: "Read Gong call recordings and transcripts",
    category: "Support",
  },
  {
    provider: "teams",
    name: "Microsoft Teams",
    description: "Read and send Microsoft Teams chat messages",
    category: "Communication",
  },
  {
    provider: "discord",
    name: "Discord",
    description: "List Discord guilds, channels, and messages",
    category: "Communication",
  },
  {
    provider: "bookstack",
    name: "BookStack",
    description: "Read BookStack books, chapters, and pages (server-token)",
    category: "Server-token",
  },
  {
    provider: "gitbook",
    name: "GitBook",
    description: "Read GitBook spaces and pages (server-token)",
    category: "Server-token",
  },
  {
    provider: "canvas",
    name: "Canvas LMS",
    description: "Read Canvas courses, assignments, and quizzes (server-token)",
    category: "Server-token",
  },
  {
    provider: "loopio",
    name: "Loopio",
    description: "Search Loopio sales answer entries (server-token)",
    category: "Server-token",
  },
  {
    provider: "discourse",
    name: "Discourse",
    description: "Read Discourse forum topics and posts (server-token)",
    category: "Server-token",
  },
  {
    provider: "xenforo",
    name: "XenForo",
    description: "Read XenForo forums, threads, and posts (server-token)",
    category: "Server-token",
  },
  {
    provider: "drupal-wiki",
    name: "Drupal Wiki",
    description: "Read Drupal wiki nodes and search (server-token)",
    category: "Server-token",
  },
  {
    provider: "axero",
    name: "Axero",
    description: "Read Axero intranet spaces and content (server-token)",
    category: "Server-token",
  },
  {
    provider: "zulip",
    name: "Zulip",
    description: "Read and send Zulip stream messages (server-token)",
    category: "Server-token",
  },
  {
    provider: "mediawiki",
    name: "MediaWiki",
    description: "Read any MediaWiki-based wiki (server-token)",
    category: "Server-token",
  },
  {
    provider: "fireflies",
    name: "Fireflies",
    description: "Read Fireflies meeting transcripts and summaries (server-token)",
    category: "Server-token",
  },
  {
    provider: "wikipedia",
    name: "Wikipedia",
    description: "Search and read Wikipedia articles (no auth required)",
    category: "Server-token",
  },
];

export default async function ConnectorsSettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const userId = session.user.id;

  // Fetch all user connector rows and availability in parallel.
  const [rows, ...availability] = await Promise.all([
    db
      .select({
        provider: UserConnectorTable.provider,
        email: UserConnectorTable.email,
        isConnected: UserConnectorTable.isConnected,
        isPaused: UserConnectorTable.isPaused,
        lastSyncAt: UserConnectorTable.lastSyncAt,
        updatedAt: UserConnectorTable.updatedAt,
      })
      .from(UserConnectorTable)
      .where(eq(UserConnectorTable.userId, userId)),
    ...CATALOG.map((c) => isProviderConfigured(c.provider)),
  ]);

  const byProvider = new Map(
    rows.map((r) => [r.provider as ConnectorProvider, r]),
  );

  const connectors = CATALOG.map((c, i) => {
    const row = byProvider.get(c.provider);
    const isAvailable = availability[i] || (row?.isConnected ?? false);
    return {
      provider: c.provider,
      name: c.name,
      description: c.description,
      category: c.category,
      isAvailable,
      isConnected: row?.isConnected ?? false,
      isPaused: row?.isPaused ?? false,
      email: row?.email ?? null,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });

  const connectedCount = connectors.filter((c) => c.isConnected).length;
  const pausedCount = connectors.filter((c) => c.isConnected && c.isPaused).length;
  const availableCount = connectors.filter((c) => c.isAvailable).length;

  return (
    <ConnectorsSettingsView
      connectors={connectors}
      stats={{
        connected: connectedCount,
        paused: pausedCount,
        available: availableCount,
        total: connectors.length,
      }}
    />
  );
}
