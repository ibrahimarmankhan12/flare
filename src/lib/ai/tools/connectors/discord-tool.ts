import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_guilds", "list_channels", "list_messages", "send_message"]),
  guildId: z.string().optional().describe("Discord guild (server) ID"),
  channelId: z.string().optional().describe("Discord channel ID"),
  text: z.string().optional().describe("Message text (for send_message)"),
  limit: z.number().min(1).max(100).optional(),
});

interface DiscordToolInput {
  action: "list_guilds" | "list_channels" | "list_messages" | "send_message";
  guildId?: string;
  channelId?: string;
  text?: string;
  limit?: number;
}

const DISCORD_API = "https://discord.com/api/v10";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "discord"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("discord", rows[0]);
}

export function createDiscordToolForUser(userId: string): Tool {
  return createTool({
    description: `Discord integration tool.

Actions:
- list_guilds: List guilds the bot has access to.
- list_channels: List channels in a guild (requires: guildId).
- list_messages: List recent messages in a channel (requires: channelId).
- send_message: Send a message to a channel (requires: channelId, text).`,
    inputSchema,
    execute: async (input: DiscordToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Discord is not connected." };
        const headers = {
          Authorization: `Bot ${accessToken}`,
          "Content-Type": "application/json",
        };
        if (action === "list_guilds") {
          const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers });
          return await res.json();
        }
        if (action === "list_channels") {
          if (!input.guildId) return { error: "guildId required" };
          const res = await fetch(
            `${DISCORD_API}/guilds/${input.guildId}/channels`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_messages") {
          if (!input.channelId) return { error: "channelId required" };
          const res = await fetch(
            `${DISCORD_API}/channels/${input.channelId}/messages?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "send_message") {
          if (!input.channelId || !input.text) {
            return { error: "channelId and text required" };
          }
          const res = await fetch(
            `${DISCORD_API}/channels/${input.channelId}/messages`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ content: input.text }),
            },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Discord tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Discord operation failed.",
        };
      }
    },
  });
}

export const discordTool = createTool({
  description: "Discord tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Discord tool requires user context." }),
});
