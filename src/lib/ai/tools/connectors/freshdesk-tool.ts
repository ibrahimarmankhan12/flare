import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_tickets", "get_ticket", "create_ticket", "add_reply"]),
  ticketId: z.union([z.string(), z.number()]).optional(),
  status: z.number().int().optional().describe("Filter by status (2=Open, 3=Pending, 4=Resolved, 5=Closed)"),
  subject: z.string().optional().describe("Ticket subject (for create_ticket)"),
  description: z.string().optional().describe("Ticket description (for create_ticket)"),
  body: z.string().optional().describe("Reply body (for add_reply)"),
  limit: z.number().min(1).max(100).optional(),
});

interface FreshdeskToolInput {
  action: "list_tickets" | "get_ticket" | "create_ticket" | "add_reply";
  ticketId?: string | number;
  status?: number;
  subject?: string;
  description?: string;
  body?: string;
  limit?: number;
}

function getBaseUrl(): string {
  const subdomain = process.env.FRESHDESK_SUBDOMAIN || "";
  return subdomain ? `https://${subdomain}.freshdesk.com/api/v2` : "";
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "freshdesk"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("freshdesk", rows[0]);
}

export function createFreshdeskToolForUser(userId: string): Tool {
  return createTool({
    description: `Freshdesk integration tool.

Actions:
- list_tickets: List tickets (optional: status).
- get_ticket: Read a ticket (requires: ticketId).
- create_ticket: Create a ticket (requires: subject, description).
- add_reply: Add a reply to a ticket (requires: ticketId, body).`,
    inputSchema,
    execute: async (input: FreshdeskToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        if (!base) return { error: "Freshdesk is not configured (FRESHDESK_SUBDOMAIN missing)." };
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Freshdesk is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "list_tickets") {
          const url = input.status
            ? `${base}/tickets?status=${input.status}&per_page=${limit}`
            : `${base}/tickets?per_page=${limit}`;
          const res = await fetch(url, { headers });
          return await res.json();
        }
        if (action === "get_ticket") {
          if (!input.ticketId) return { error: "ticketId required" };
          const res = await fetch(`${base}/tickets/${input.ticketId}`, { headers });
          return await res.json();
        }
        if (action === "create_ticket") {
          if (!input.subject || !input.description) {
            return { error: "subject and description required" };
          }
          const res = await fetch(`${base}/tickets`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              name: "Flare User",
              email: "flare@users.noreply",
              subject: input.subject,
              description: input.description,
              status: input.status ?? 2,
              priority: 1,
              source: 2,
            }),
          });
          return await res.json();
        }
        if (action === "add_reply") {
          if (!input.ticketId || !input.body) {
            return { error: "ticketId and body required" };
          }
          const res = await fetch(`${base}/tickets/${input.ticketId}/reply`, {
            method: "POST",
            headers,
            body: JSON.stringify({ body: input.body }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Freshdesk tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Freshdesk operation failed.",
        };
      }
    },
  });
}

export const freshdeskTool = createTool({
  description: "Freshdesk tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Freshdesk tool requires user context." }),
});
