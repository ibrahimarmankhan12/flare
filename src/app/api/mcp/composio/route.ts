import { createComposioSession, isComposioConfigured } from "lib/ai/composio";
import {
  saveMcpClientAction,
  removeMcpClientAction,
  selectMcpClientsAction,
} from "../actions";
import { getSession } from "auth/server";
import { NextResponse } from "next/server";

// POST /api/mcp/composio — connect Composio
// Creates a Composio MCP session and persists it as an MCP server entry
export async function POST() {
  try {
    if (!isComposioConfigured()) {
      return NextResponse.json(
        {
          error:
            "Composio is not configured. Set COMPOSIO_API_KEY in your environment.",
        },
        { status: 400 },
      );
    }

    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create a Composio session
    const composioSession = await createComposioSession(session.user.id);

    // Save as an MCP server entry via the server action (handles permissions)
    await saveMcpClientAction({
      name: "composio",
      config: {
        url: composioSession.mcpUrl,
        headers: composioSession.mcpHeaders,
      },
      userId: session.user.id,
      visibility: "private",
    });

    return NextResponse.json({
      connected: true,
      message: "Composio connected successfully",
    });
  } catch (error) {
    console.error("Failed to connect Composio:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to connect Composio",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/mcp/composio — disconnect Composio
export async function DELETE() {
  try {
    const userSession = await getSession();
    if (!userSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await removeMcpClientAction("composio");

    return NextResponse.json({
      disconnected: true,
      message: "Composio disconnected",
    });
  } catch (error) {
    console.error("Failed to disconnect Composio:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to disconnect Composio",
      },
      { status: 500 },
    );
  }
}

// GET /api/mcp/composio — check Composio connection status
export async function GET() {
  try {
    const userSession = await getSession();
    if (!userSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isConfigured = isComposioConfigured();
    let connected = false;

    try {
      const clients = await selectMcpClientsAction();
      connected = clients.some(
        (c) => c.name === "composio" || c.id === "composio",
      );
    } catch {}

    return NextResponse.json({ isConfigured, connected });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to check Composio status" },
      { status: 500 },
    );
  }
}
