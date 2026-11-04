import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";

const inputSchema = z.object({
  action: z.enum(["search", "get_summary", "get_full"]),
  query: z.string().optional().describe("Search query (for search action)"),
  title: z.string().optional().describe("Page title (for get_summary and get_full)"),
  limit: z.number().min(1).max(50).optional(),
});

interface WikipediaToolInput {
  action: "search" | "get_summary" | "get_full";
  query?: string;
  title?: string;
  limit?: number;
}

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const WIKI_REST = "https://en.wikipedia.org/api/rest_v1";

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "wikipedia"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createWikipediaToolForUser(userId: string): Tool {
  return createTool({
    description: `Wikipedia integration tool (no auth required).

The Wikipedia REST API is public; no auth, no rate limit needed for reasonable
usage. Each click of the "Connect" button on the Connectors popover just
records a per-user row in user_connector (it doesn't fetch any token).

Actions:
- search: Search Wikipedia by query.
- get_summary: Read an article summary (requires: title).
- get_full: Read an article's full text (requires: title).`,
    inputSchema,
    execute: async (input: WikipediaToolInput) => {
      try {
        const { action, limit = 10 } = input;
        if (!(await getIsConnected(userId))) {
          return { error: "Wikipedia is not connected. Click Connect to enable (no auth required)." };
        }
        // Wikipedia requires a descriptive User-Agent for the REST API.
        const headers = {
          "Api-User-Agent": "Flare-AI-Connector/1.0 (https://github.com/onyx-dot-app/onyx-port)",
          Accept: "application/json",
        };

        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const params = new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: input.query,
            srlimit: String(limit),
            format: "json",
            origin: "*",
          });
          const res = await fetch(`${WIKI_API}?${params}`, { headers });
          return await res.json();
        }
        if (action === "get_summary") {
          if (!input.title) return { error: "title required" };
          const url = `${WIKI_REST}/page/summary/${encodeURIComponent(input.title)}`;
          const res = await fetch(url, { headers });
          return await res.json();
        }
        if (action === "get_full") {
          if (!input.title) return { error: "title required" };
          // Mobile-sections REST endpoint returns plain-text sections.
          const url = `${WIKI_REST}/page/mobile-sections/${encodeURIComponent(input.title)}`;
          const res = await fetch(url, { headers });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Wikipedia tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Wikipedia operation failed.",
        };
      }
    },
  });
}

export const wikipediaTool = createTool({
  description: "Wikipedia tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Wikipedia tool requires user context." }),
});
