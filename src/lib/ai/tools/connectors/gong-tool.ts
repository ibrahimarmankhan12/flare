import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_calls", "get_call", "get_transcript"]),
  callId: z.string().optional(),
  fromDate: z.string().optional().describe("ISO date — calls after this date"),
  toDate: z.string().optional().describe("ISO date — calls before this date"),
  limit: z.number().min(1).max(100).optional(),
});

interface GongToolInput {
  action: "list_calls" | "get_call" | "get_transcript";
  callId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

const GONG_API = "https://api.gong.io/v2";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "gong"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("gong", rows[0]);
}

export function createGongToolForUser(userId: string): Tool {
  return createTool({
    description: `Gong integration tool.

Actions:
- list_calls: List calls in a date range (optional: fromDate, toDate).
- get_call: Read a call's metadata (requires: callId).
- get_transcript: Read a call's transcript (requires: callId).`,
    inputSchema,
    execute: async (input: GongToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Gong is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };
        if (action === "list_calls") {
          const filter: any = {};
          if (input.fromDate) filter.fromDateTime = input.fromDate;
          if (input.toDate) filter.toDateTime = input.toDate;
          const res = await fetch(`${GONG_API}/calls`, {
            method: "POST",
            headers,
            body: JSON.stringify({ filter, limit }),
          });
          return await res.json();
        }
        if (action === "get_call") {
          if (!input.callId) return { error: "callId required" };
          const res = await fetch(`${GONG_API}/calls/extensive?filter.callIds[0]=${input.callId}`, {
            headers,
          });
          return await res.json();
        }
        if (action === "get_transcript") {
          if (!input.callId) return { error: "callId required" };
          const res = await fetch(
            `${GONG_API}/calls/transcript?filter.callIds[0]=${input.callId}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Gong tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Gong operation failed.",
        };
      }
    },
  });
}

export const gongTool = createTool({
  description: "Gong tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Gong tool requires user context." }),
});
