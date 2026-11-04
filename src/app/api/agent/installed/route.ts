import "server-only";

import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AgentTable } from "lib/db/pg/schema.pg";
import { agentInstallRepository } from "lib/db/repository";
import globalLogger from "logger";

export const dynamic = "force-dynamic";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Agent Installed API: `),
});

// ---------------------------------------------------------------------------
// P4.E — GET /api/agent/installed
//
// Lists every published agent the current user has installed from the
// public gallery. This is the inverse of /api/agent/published: where
// published returns the public catalogue, this returns the caller's
// private "My installed agents" list.
//
// Output shape:
//   {
//     agents: [
//       {
//         installId:    string — the agent_install row id
//         agent: {
//           id, name, description,
//           publishedAt, installCount,
//           coverImageUrl, galleryMetadata
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
    const installs = await agentInstallRepository.listAgentInstalls(
      userId,
      activeOrgId,
    );

    if (installs.length === 0) {
      return Response.json({ agents: [] });
    }

    // Fetch the gallery-visible metadata for each installed agent in a
    // single query (avoids N+1).
    const agentIds = Array.from(
      new Set(installs.map((install) => install.agentId)),
    );
    const agentRows = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        publishedAt: AgentTable.publishedAt,
        installCount: AgentTable.installCount,
        coverImageUrl: AgentTable.coverImageUrl,
        galleryMetadata: AgentTable.galleryMetadata,
        visibility: AgentTable.visibility,
      })
      .from(AgentTable)
      .where(inArray(AgentTable.id, agentIds));

    const agentById = new Map(agentRows.map((row) => [row.id, row]));

    const payload = installs
      .map((install) => {
        const agent = agentById.get(install.agentId);
        if (!agent) {
          // Agent was deleted out from under the install row. Skip it
          // so the dashboard doesn't show a broken card.
          logger.warn(
            `Install ${install.id} references missing agent ${install.agentId}`,
          );
          return null;
        }
        return {
          installId: install.id,
          agent: {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            icon: agent.icon ?? null,
            publishedAt:
              agent.publishedAt instanceof Date
                ? agent.publishedAt.toISOString()
                : agent.publishedAt
                  ? new Date(
                      agent.publishedAt as unknown as string,
                    ).toISOString()
                  : null,
            installCount: agent.installCount,
            coverImageUrl: agent.coverImageUrl,
            galleryMetadata: agent.galleryMetadata ?? null,
            visibility: agent.visibility,
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

    return Response.json({ agents: payload });
  } catch (err) {
    logger.error("Failed to list installed agents", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
