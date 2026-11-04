import "server-only";
import { Composio } from "@composio/core";

let composioInstance: Composio | null = null;

function getComposio(): Composio {
  if (!composioInstance) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      throw new Error("COMPOSIO_API_KEY is not set");
    }
    composioInstance = new Composio({ apiKey });
  }
  return composioInstance;
}

export interface ComposioSession {
  mcpUrl: string;
  mcpHeaders: Record<string, string>;
}

export async function createComposioSession(
  userId: string,
): Promise<ComposioSession> {
  const composio = getComposio();
  const session = await composio.create(userId, { mcp: true });
  return {
    mcpUrl: session.mcp.url,
    mcpHeaders: session.mcp.headers as Record<string, string>,
  };
}

export function isComposioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}
