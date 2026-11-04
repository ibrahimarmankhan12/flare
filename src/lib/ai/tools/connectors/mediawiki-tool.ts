import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["search", "get_summary", "get_full"]),
  query: z.string().optional().describe("Search query"),
  title: z.string().optional().describe("Page title (for get_summary and get_full)"),
  limit: z.number().min(1).max(50).optional(),
});

interface MediawikiToolInput {
  action: "search" | "get_summary" | "get_full";
  query?: string;
  title?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.MEDIAWIKI_BASE_URL?.replace(/\/+$/, "") || "https://en.wikipedia.org";
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "mediawiki"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createMediawikiToolForUser(userId: string): Tool {
  return createTool({
    description: `MediaWiki integration tool (server-token).

Works with any MediaWiki-based wiki (Fandom, custom wikis, Wikipedia mirrors).
The token env var can hold a bot password in the form "user@password".

Actions:
- search: Search articles by query.
- get_summary: Read an article's summary (requires: title).
- get_full: Read an article's full HTML (requires: title).`,
    inputSchema,
    execute: async (input: MediawikiToolInput) => {
      try {
        const { action, limit = 10 } = input;
        const token = getTokenProviderToken("mediawiki");
        if (!token) {
          return { error: "MediaWiki is not configured. Set MEDIAWIKI_API_TOKEN." };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "MediaWiki is not connected. Click Connect to enable (single-tenant)." };
        }
        const base = getBaseUrl();
        // Parse "user@password" format
        const at = token.indexOf("@");
        const user = at > 0 ? token.slice(0, at) : "";
        const pass = at > 0 ? token.slice(at + 1) : token;
        const auth = user
          ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
          : null;
        const headers: Record<string, string> = {
          "Api-User-Agent": "Flare-AI-Connector/1.0",
          Accept: "application/json",
        };
        if (auth) headers["Authorization"] = auth;

        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const params = new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: input.query,
            srlimit: String(limit),
            format: "json",
          });
          const res = await fetch(`${base}/w/api.php?${params}`, { headers });
          return await res.json();
        }
        if (action === "get_summary") {
          if (!input.title) return { error: "title required" };
          const params = new URLSearchParams({
            action: "query",
            prop: "extracts",
            exintro: "1",
            explaintext: "1",
            titles: input.title,
            format: "json",
          });
          const res = await fetch(`${base}/w/api.php?${params}`, { headers });
          return await res.json();
        }
        if (action === "get_full") {
          if (!input.title) return { error: "title required" };
          const params = new URLSearchParams({
            action: "parse",
            page: input.title,
            format: "json",
            prop: "text",
          });
          const res = await fetch(`${base}/w/api.php?${params}`, { headers });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("MediaWiki tool error:", error);
        return {
          error: error instanceof Error ? error.message : "MediaWiki operation failed.",
        };
      }
    },
  });
}

export const mediawikiTool = createTool({
  description: "MediaWiki tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "MediaWiki tool requires user context." }),
});
