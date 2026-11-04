import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_channels", "list_messages"]),
  channelId: z
    .string()
    .optional()
    .describe("Slack channel ID (for list_messages action)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of items to return (default 30)"),
});

interface SlackToolInput {
  action: "list_channels" | "list_messages";
  channelId?: string;
  limit?: number;
}

const SLACK_API = "https://slack.com/api";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "slack"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("slack", rows[0]);
}

export function createSlackToolForUser(userId: string): Tool {
  return createTool({
    description: `Slack integration tool.

Actions:
- list_channels: List public and private channels the user belongs to (optional: limit 1-100, default 30).
- list_messages: List recent messages in a channel (requires: channelId from list_channels results, optional: limit).

IMPORTANT:
- User must connect Slack first via the Connectors menu.
- Posting messages is not yet supported.`,
    inputSchema,
    execute: async (input: SlackToolInput) => {
      try {
        const { action, channelId, limit = 30 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Slack is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        };

        if (action === "list_messages") {
          if (!channelId) {
            return { error: "channelId is required for list_messages" };
          }
          const res = await fetch(
            `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
            { headers },
          );
          const data = await res.json();
          if (!data.ok) {
            return { error: data.error || "Failed to list messages" };
          }
          return {
            messages: ((data.messages as any[]) || []).map((m) => ({
              ts: m.ts,
              user: m.user,
              text: m.text,
              thread_ts: m.thread_ts,
            })),
          };
        }

        // list_channels
        const res = await fetch(
          `${SLACK_API}/conversations.list?limit=${limit}&exclude_archived=true&types=public_channel,private_channel`,
          { headers },
        );
        const data = await res.json();
        if (!data.ok) {
          return { error: data.error || "Failed to list channels" };
        }
        return {
          channels: ((data.channels as any[]) || []).map((c) => ({
            id: c.id,
            name: c.name,
            is_private: c.is_private,
            is_member: c.is_member,
          })),
        };
      } catch (error) {
        console.error("Slack tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Slack operation failed.",
        };
      }
    },
  });
}

export const slackTool = createTool({
  description: "Slack tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Slack tool requires user context. This should not happen in normal operation.",
  }),
});
