import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_meetings", "get_transcript", "get_summary"]),
  meetingId: z.string().optional(),
  fromDate: z.string().optional().describe("ISO date — meetings after this date"),
  toDate: z.string().optional().describe("ISO date — meetings before this date"),
  limit: z.number().min(1).max(100).optional(),
});

interface FirefliesToolInput {
  action: "list_meetings" | "get_transcript" | "get_summary";
  meetingId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("fireflies");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "fireflies"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createFirefliesToolForUser(userId: string): Tool {
  return createTool({
    description: `Fireflies.ai integration tool (server-token).

Actions:
- list_meetings: List meetings (optional: fromDate, toDate).
- get_transcript: Read a meeting transcript (requires: meetingId).
- get_summary: Read a meeting summary (requires: meetingId).`,
    inputSchema,
    execute: async (input: FirefliesToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const auth = await getAuthHeader();
        if (!auth) return { error: "Fireflies is not configured (FIREFLIES_API_KEY)." };
        if (!(await getIsConnected(userId))) {
          return { error: "Fireflies is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = {
          Authorization: auth,
          "Content-Type": "application/json",
        };
        const gql = async (query: string, variables: any = {}) => {
          const res = await fetch(FIREFLIES_API, {
            method: "POST",
            headers,
            body: JSON.stringify({ query, variables }),
          });
          if (!res.ok) return { error: `Fireflies API error: ${res.status}` };
          return await res.json();
        };

        if (action === "list_meetings") {
          const filter: any = {};
          if (input.fromDate) filter.fromDate = input.fromDate;
          if (input.toDate) filter.toDate = input.toDate;
          const data = (await gql(
            `query($limit: Int, $fromDate: String, $toDate: String) {
              transcripts(limit: $limit, filter: { date: { gte: $fromDate, lte: $toDate } }) {
                id title date duration participants { name email }
              }
            }`,
            { limit, fromDate: input.fromDate, toDate: input.toDate },
          )) as any;
          return { meetings: data?.data?.transcripts || [] };
        }
        if (action === "get_transcript") {
          if (!input.meetingId) return { error: "meetingId required" };
          const data = (await gql(
            `query($id: String!) { transcript(id: $id) { id title sentences { text speaker } } }`,
            { id: input.meetingId },
          )) as any;
          return { transcript: data?.data?.transcript };
        }
        if (action === "get_summary") {
          if (!input.meetingId) return { error: "meetingId required" };
          const data = (await gql(
            `query($id: String!) { transcript(id: $id) { id title summary action_items keywords } }`,
            { id: input.meetingId },
          )) as any;
          return { summary: data?.data?.transcript };
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Fireflies tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Fireflies operation failed.",
        };
      }
    },
  });
}

export const firefliesTool = createTool({
  description: "Fireflies tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Fireflies tool requires user context." }),
});
