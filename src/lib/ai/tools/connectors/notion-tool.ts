import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["search", "read_page"]),
  pageId: z
    .string()
    .optional()
    .describe("Notion page ID (for read_page action)"),
  query: z
    .string()
    .optional()
    .describe("Search query (for search action). Empty string lists recent pages."),
});

interface NotionToolInput {
  action: "search" | "read_page";
  pageId?: string;
  query?: string;
}

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "notion"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("notion", rows[0]);
}

export function createNotionToolForUser(userId: string): Tool {
  return createTool({
    description: `Notion integration tool.

Actions:
- search: Search the user's Notion pages (optional: query string).
- read_page: Read a page's metadata and block content (requires: pageId from search results).

IMPORTANT:
- User must connect Notion first via the Connectors menu.
- Notion access is workspace-wide; the user controls which pages the integration can see in their Notion settings.`,
    inputSchema,
    execute: async (input: NotionToolInput) => {
      try {
        const { action, pageId, query = "" } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Notion is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        };

        if (action === "read_page") {
          if (!pageId) {
            return { error: "pageId is required for read_page" };
          }
          const pageRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
            headers,
          });
          if (!pageRes.ok) {
            return { error: "Failed to fetch page" };
          }
          const page = await pageRes.json();
          const blocksRes = await fetch(
            `${NOTION_API}/blocks/${pageId}/children?page_size=50`,
            { headers },
          );
          const blocks = blocksRes.ok
            ? ((await blocksRes.json()).results as any[])
            : [];
          return { page, blocks };
        }

        // search
        const res = await fetch(`${NOTION_API}/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            page_size: 20,
            filter: { value: "page", property: "object" },
          }),
        });
        if (!res.ok) {
          return { error: "Failed to search Notion" };
        }
        const data = (await res.json()) as { results?: any[] };
        return {
          results: (data.results || []).map((r) => ({
            id: r.id,
            title:
              r.properties?.title?.title?.[0]?.plain_text ||
              r.properties?.Name?.title?.[0]?.plain_text ||
              "(untitled)",
            url: r.url,
            last_edited_time: r.last_edited_time,
          })),
          count: data.results?.length || 0,
        };
      } catch (error) {
        console.error("Notion tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Notion operation failed.",
        };
      }
    },
  });
}

export const notionTool = createTool({
  description: "Notion tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Notion tool requires user context. This should not happen in normal operation.",
  }),
});
