import { JSONSchema7 } from "json-schema";
import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";

/**
 * Combined listing tool: returns the connected providers for the current user.
 * Lets the model discover which connectors are available before invoking
 * a per-provider tool.
 */

const schema = {
  type: "object" as const,
  properties: {
    include_disconnected: {
      type: "boolean",
      description:
        "If true, also include providers that are configured but not currently connected (paused).",
    },
  },
  required: [],
} satisfies JSONSchema7;

const zodSchema = z.object({
  include_disconnected: z
    .boolean()
    .optional()
    .describe(
      "If true, also include providers that are configured but currently paused.",
    ),
});

export const connectorsListTool: Tool = createTool({
  description:
    "List the user's connected connectors (Gmail, Google Drive, Google Calendar, Outlook, GitHub, Slack, Notion, Confluence, Jira, Linear, Asana, ClickUp, Productboard, TestRail, Coda, Outline, Slab, Guru, Highspot, Document360, GitLab, Bitbucket, Dropbox, Zendesk, Freshdesk, Salesforce, HubSpot, Airtable, Gong, Egnyte, Teams, Discord, BookStack, GitBook, Canvas LMS, Loopio, Discourse, XenForo, Drupal Wiki, Axero, Zulip, MediaWiki, Fireflies, Wikipedia). Returns the provider name, account email/label, connection status, and granted scopes. Use this first to discover which providers the user has connected, then call the specific per-provider tool to perform actions.",
  inputSchema: zodSchema,
  execute: async () => {
    // Factory function — actual user context is provided by getAppDefaultToolKitForUser
    return {
      error:
        "connectors_list tool requires user context. This should not happen in normal operation.",
    };
  },
});

export function createConnectorsListToolForUser(userId: string): Tool {
  return createTool({
    description:
      "List the user's connected connectors (Gmail, Google Drive, Google Calendar, Outlook, GitHub, Slack, Notion, Confluence, Jira, Linear, Asana, ClickUp, Productboard, TestRail, Coda, Outline, Slab, Guru, Highspot, Document360, GitLab, Bitbucket, Dropbox, Zendesk, Freshdesk, Salesforce, HubSpot, Airtable, Gong, Egnyte, Teams, Discord, BookStack, GitBook, Canvas LMS, Loopio, Discourse, XenForo, Drupal Wiki, Axero, Zulip, MediaWiki, Fireflies, Wikipedia). Returns the provider name, account email/label, connection status, and granted scopes. Use this first to discover which providers the user has connected, then call the specific per-provider tool to perform actions.",
    inputSchema: zodSchema,
    execute: async ({ include_disconnected }) => {
      try {
        const where = include_disconnected
          ? eq(UserConnectorTable.userId, userId)
          : and(
              eq(UserConnectorTable.userId, userId),
              eq(UserConnectorTable.isConnected, true),
            );

        const rows = await db
          .select({
            provider: UserConnectorTable.provider,
            email: UserConnectorTable.email,
            isConnected: UserConnectorTable.isConnected,
            scope: UserConnectorTable.scope,
            lastSyncAt: UserConnectorTable.lastSyncAt,
          })
          .from(UserConnectorTable)
          .where(where);

        return {
          count: rows.length,
          connectors: rows.map((r) => ({
            provider: r.provider,
            email: r.email,
            isConnected: r.isConnected,
            scope: r.scope,
            lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
          })),
          info:
            rows.length === 0
              ? "No connectors are currently connected. Ask the user to connect one via the Connectors menu."
              : `Found ${rows.length} connector(s).`,
        };
      } catch (error) {
        console.error("connectors_list error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Failed to list connectors.",
        };
      }
    },
  });
}

// Reference the schema constant so it isn't tree-shaken if a future caller
// wants to read it; ignore the lint warning.
void schema;
