import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_chats", "list_chat_messages", "send_chat_message"]),
  chatId: z.string().optional().describe("Microsoft Teams chat ID"),
  body: z.string().optional().describe("Message body (for send_chat_message)"),
  limit: z.number().min(1).max(100).optional(),
});

interface TeamsToolInput {
  action: "list_chats" | "list_chat_messages" | "send_chat_message";
  chatId?: string;
  body?: string;
  limit?: number;
}

const GRAPH_API = "https://graph.microsoft.com/v1.0";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "teams"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("teams", rows[0]);
}

export function createTeamsToolForUser(userId: string): Tool {
  return createTool({
    description: `Microsoft Teams integration tool.

Actions:
- list_chats: List the user's Teams chats.
- list_chat_messages: List messages in a chat (requires: chatId).
- send_chat_message: Send a message to a chat (requires: chatId, body).

User must connect Teams first via the Connectors menu. Uses the same Microsoft
tenant as the Outlook connector.`,
    inputSchema,
    execute: async (input: TeamsToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Teams is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "list_chats") {
          const res = await fetch(`${GRAPH_API}/me/chats?$top=${limit}`, { headers });
          return await res.json();
        }
        if (action === "list_chat_messages") {
          if (!input.chatId) return { error: "chatId required" };
          const res = await fetch(
            `${GRAPH_API}/chats/${input.chatId}/messages?$top=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "send_chat_message") {
          if (!input.chatId || !input.body) {
            return { error: "chatId and body required" };
          }
          const res = await fetch(
            `${GRAPH_API}/chats/${input.chatId}/messages`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ body: { content: input.body } }),
            },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Teams tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Teams operation failed.",
        };
      }
    },
  });
}

export const teamsTool = createTool({
  description: "Teams tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Teams tool requires user context." }),
});
