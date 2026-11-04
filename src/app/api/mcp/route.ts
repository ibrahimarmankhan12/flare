import { getSession } from "auth/server";
import { logger } from "better-auth";
import { canCreateMCP } from "lib/auth/permissions";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { errorToString } from "lib/utils";
import { NextResponse } from "next/server";
import { saveMcpClientAction } from "./actions";

const inferMcpErrorStatus = (message: string): number => {
  const normalized = message.toLowerCase();
  if (normalized.includes("unauthorized") || normalized.includes("logged in")) {
    return 401;
  }
  if (
    normalized.includes("permission") ||
    normalized.includes("only administrators")
  ) {
    return 403;
  }
  if (normalized.includes("already exists")) {
    return 409;
  }
  if (
    normalized.includes("not a public mcp server endpoint") ||
    normalized.includes("contains unresolved placeholders") ||
    normalized.includes("name must contain only alphanumeric") ||
    normalized.includes("supports remote mcp servers") ||
    normalized.includes("connection test failed") ||
    normalized.includes("non-200 status code") ||
    normalized.includes("failed to connect") ||
    normalized.includes("sse error") ||
    normalized.includes("invalid")
  ) {
    return 400;
  }
  return 500;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user has permission to create MCP connections
  const hasPermission = await canCreateMCP();
  if (!hasPermission) {
    return NextResponse.json(
      { error: "You don't have permission to create MCP connections" },
      { status: 403 },
    );
  }

  const json = (await request.json()) as typeof McpServerTable.$inferInsert;

  try {
    const result = await saveMcpClientAction(json);

    return NextResponse.json({ success: true, id: result.client.getInfo().id });
  } catch (error: any) {
    const message = errorToString(error) || "Failed to save MCP client";
    const status = inferMcpErrorStatus(message);
    logger.error("Failed to save MCP client", { error });
    return NextResponse.json({ message }, { status });
  }
}
