import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_spaces", "search_pages", "get_page", "get_comments"]),
  spaceKey: z
    .string()
    .optional()
    .describe("Confluence space key (for search_pages and get_page)"),
  pageId: z
    .string()
    .optional()
    .describe("Confluence page ID (for get_page and get_comments)"),
  query: z
    .string()
    .optional()
    .describe("Search query (for search_pages action)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of items to return (default 25)"),
});

interface ConfluenceToolInput {
  action: "list_spaces" | "search_pages" | "get_page" | "get_comments";
  spaceKey?: string;
  pageId?: string;
  query?: string;
  limit?: number;
}

const CONFLUENCE_API = "https://api.atlassian.com/wiki/api/v2";
// Atlassian Cloud OAuth 2.0 requires a per-workspace cloud ID. Resolved at
// connect time and stored in `metadata.cloudId`.
const CLOUD_ID_METADATA_KEY = "cloudId";

async function getAccessToken(userId: string) {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "confluence"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  const token = await refreshConnectorToken("confluence", rows[0]);
  if (!token) return null;
  const cloudId = (rows[0].metadata as any)?.[CLOUD_ID_METADATA_KEY] as
    | string
    | undefined;
  return { token, cloudId };
}

export function createConfluenceToolForUser(userId: string): Tool {
  return createTool({
    description: `Confluence integration tool.

Actions:
- list_spaces: List accessible Confluence spaces.
- search_pages: Search pages by query (optional: spaceKey to scope).
- get_page: Read a page's body and metadata (requires: pageId).
- get_comments: List comments on a page (requires: pageId).

User must connect Confluence first via the Connectors menu.`,
    inputSchema,
    execute: async (input: ConfluenceToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const creds = await getAccessToken(userId);
        if (!creds) {
          return {
            error:
              "Confluence is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }
        if (!creds.cloudId) {
          return {
            error:
              "Confluence workspace not yet linked. Please reconnect Confluence.",
          };
        }
        const headers = {
          Authorization: `Bearer ${creds.token}`,
          Accept: "application/json",
        };
        const baseUrl = `${CONFLUENCE_API}/wikis/${creds.cloudId}`;

        if (action === "list_spaces") {
          const res = await fetch(
            `${baseUrl}/spaces?limit=${limit}`,
            { headers },
          );
          if (!res.ok) {
            return { error: `Confluence API error: ${res.status}` };
          }
          const data = (await res.json()) as { results?: any[] };
          return {
            spaces: (data.results || []).map((s) => ({
              id: s.id,
              key: s.key,
              name: s.name,
              type: s.type,
            })),
          };
        }

        if (action === "search_pages") {
          const cql = input.query
            ? `text ~ "${input.query.replace(/"/g, '\\"')}"`
            : "type = page";
          const spaceFilter = input.spaceKey
            ? ` AND space = "${input.spaceKey}"`
            : "";
          const url = `${baseUrl}/pages?body-format=storage&limit=${limit}&${new URLSearchParams({ _query: cql + spaceFilter })}`;
          const res = await fetch(url, { headers });
          if (!res.ok) {
            return { error: `Confluence search failed: ${res.status}` };
          }
          const data = (await res.json()) as { results?: any[] };
          return {
            pages: (data.results || []).map((p) => ({
              id: p.id,
              title: p.title,
              spaceId: p.spaceId,
            })),
          };
        }

        if (action === "get_page") {
          if (!input.pageId) {
            return { error: "pageId is required for get_page" };
          }
          const res = await fetch(
            `${baseUrl}/pages/${input.pageId}?body-format=storage`,
            { headers },
          );
          if (!res.ok) {
            return { error: `Failed to fetch page: ${res.status}` };
          }
          return await res.json();
        }

        if (action === "get_comments") {
          if (!input.pageId) {
            return { error: "pageId is required for get_comments" };
          }
          const res = await fetch(
            `${baseUrl}/pages/${input.pageId}/footer-comments?limit=${limit}`,
            { headers },
          );
          if (!res.ok) {
            return { error: `Failed to fetch comments: ${res.status}` };
          }
          const data = (await res.json()) as { results?: any[] };
          return {
            comments: (data.results || []).map((c) => ({
              id: c.id,
              body: c.body?.storage?.value,
              version: c.version,
            })),
          };
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Confluence tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Confluence operation failed.",
        };
      }
    },
  });
}

export const confluenceTool = createTool({
  description: "Confluence tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Confluence tool requires user context. This should not happen in normal operation.",
  }),
});
