import "server-only";

import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { mcpInstallRepository } from "lib/db/repository";
import globalLogger from "logger";

export const dynamic = "force-dynamic";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `MCP Installed API: `),
});

// ---------------------------------------------------------------------------
// P4.E — GET /api/mcp/installed
//
// Lists every MCP server the current user has installed from the
// marketplace. This is the inverse of /api/mcp/curated: where curated
// returns the public catalogue, this returns the caller's private
// "My installs" list.
//
// Output shape:
//   {
//     installs: [
//       {
//         installId:    string — the mcp_server_install row id
//         server: {
//           id, name, description, category,
//           installCount, curated, homepageUrl, visibility
//         },
//         config:      Record<string, unknown> — install-time config blob
//         installedAt: string                 — ISO timestamp
//         orgId:       string | null          — team scope, null = personal
//       },
//       ...
//     ]
//   }
//
// Auth: required. 401 if no session.
// ---------------------------------------------------------------------------

export async function GET(_request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  // `session.activeOrgId` is added by the P4.A org-plugin work. Until it
  // ships we degrade gracefully to "list every personal install" — the
  // route will return the same shape, just without the team-scope filter.
  const activeOrgId =
    (session as { activeOrgId?: string | null }).activeOrgId ?? null;

  try {
    const installs = await mcpInstallRepository.listMcpServerInstalls(
      userId,
      activeOrgId,
    );

    if (installs.length === 0) {
      return Response.json({ installs: [] });
    }

    // Fetch the marketplace-visible metadata for each installed server
    // in a single query (avoids N+1).
    const serverIds = Array.from(
      new Set(installs.map((install) => install.mcpServerId)),
    );
    const serverRows = await db
      .select({
        id: McpServerTable.id,
        name: McpServerTable.name,
        description: McpServerTable.description,
        category: McpServerTable.category,
        installCount: McpServerTable.installCount,
        curated: McpServerTable.curated,
        homepageUrl: McpServerTable.homepageUrl,
        visibility: McpServerTable.visibility,
      })
      .from(McpServerTable)
      .where(inArray(McpServerTable.id, serverIds));

    const serverById = new Map(serverRows.map((row) => [row.id, row]));

    const payload = installs
      .map((install) => {
        const server = serverById.get(install.mcpServerId);
        if (!server) {
          // Server was deleted out from under the install row. Skip it
          // so the dashboard doesn't show a broken card.
          logger.warn(
            `Install ${install.id} references missing server ${install.mcpServerId}`,
          );
          return null;
        }
        return {
          installId: install.id,
          server: {
            id: server.id,
            name: server.name,
            description: server.description,
            category: server.category,
            installCount: server.installCount,
            curated: server.curated,
            homepageUrl: server.homepageUrl,
            visibility: server.visibility,
          },
          config: install.config,
          installedAt:
            install.createdAt instanceof Date
              ? install.createdAt.toISOString()
              : new Date(install.createdAt as unknown as string).toISOString(),
          orgId: install.orgId ?? null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return Response.json({ installs: payload });
  } catch (err) {
    logger.error("Failed to list installed MCP servers", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
