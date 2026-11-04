import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_books", "list_chapters", "list_pages", "get_page", "search"]),
  bookId: z.union([z.string(), z.number()]).optional(),
  chapterId: z.union([z.string(), z.number()]).optional(),
  pageId: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface BookstackToolInput {
  action: "list_books" | "list_chapters" | "list_pages" | "get_page" | "search";
  bookId?: string | number;
  chapterId?: string | number;
  pageId?: string | number;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.BOOKSTACK_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const tokenId = getTokenProviderToken("bookstack");
  const tokenSecret = process.env.BOOKSTACK_API_SECRET?.trim();
  if (!tokenId || !tokenSecret) return null;
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "bookstack"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createBookstackToolForUser(userId: string): Tool {
  return createTool({
    description: `BookStack integration tool (server-token).

Actions:
- list_books: List books.
- list_chapters: List chapters in a book (requires: bookId).
- list_pages: List pages in a book or chapter (requires: bookId or chapterId).
- get_page: Read a page (requires: pageId).
- search: Search across all content (requires: query).

Configured via BOOKSTACK_URL, BOOKSTACK_API_TOKEN, BOOKSTACK_API_SECRET env vars.`,
    inputSchema,
    execute: async (input: BookstackToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return { error: "BookStack is not configured. Set BOOKSTACK_URL, BOOKSTACK_API_TOKEN, BOOKSTACK_API_SECRET." };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "BookStack is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth };

        if (action === "list_books") {
          const res = await fetch(`${base}/api/books?count=${limit}`, { headers });
          return await res.json();
        }
        if (action === "list_chapters") {
          if (!input.bookId) return { error: "bookId required" };
          const res = await fetch(
            `${base}/api/chapters?count=${limit}&filter[book_id]=${input.bookId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_pages") {
          if (!input.bookId && !input.chapterId) {
            return { error: "bookId or chapterId required" };
          }
          const filter = input.chapterId
            ? `filter[chapter_id]=${input.chapterId}`
            : `filter[book_id]=${input.bookId}`;
          const res = await fetch(
            `${base}/api/pages?count=${limit}&${filter}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_page") {
          if (!input.pageId) return { error: "pageId required" };
          const res = await fetch(`${base}/api/pages/${input.pageId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${base}/api/search?query=${encodeURIComponent(input.query)}&count=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("BookStack tool error:", error);
        return {
          error: error instanceof Error ? error.message : "BookStack operation failed.",
        };
      }
    },
  });
}

export const bookstackTool = createTool({
  description: "BookStack tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "BookStack tool requires user context." }),
});
