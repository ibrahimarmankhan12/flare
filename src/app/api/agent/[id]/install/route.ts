import "server-only";

import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { agentInstallRepository } from "lib/db/repository";
import globalLogger from "logger";

export const dynamic = "force-dynamic";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Agent Install API: `),
});

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// P4.D + P4.E — /api/agent/[id]/install
//
//   POST   — install a published gallery agent for the current user.
//             Auth required. Resolves the agent via
//             `agentInstallRepository.getPublishedAgent` (which
//             filters to published only — unpublished agents 404).
//             Upserts an `agent_install` row (UNIQUE
//             user_id+agent_id) and fire-and-forget bumps the
//             denormalized `agent.install_count`.
//             201 on success, 401 / 404 / 500 otherwise.
//
//   DELETE — uninstall. Auth required. Owner-scoped via the
//             `agent_install` UNIQUE constraint. 200 on success,
//             401 / 404 / 500 otherwise.
//
// `activeOrgId` is the P4.A Better-Auth org-plugin field. Until it
// ships we degrade to `null` (personal scope). Same defensive cast
// as the /api/agent/installed route uses.
// ---------------------------------------------------------------------------

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value as unknown as string).toISOString();
};

const serializeAgent = (
  row: Awaited<ReturnType<typeof agentInstallRepository.getPublishedAgent>>,
) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    icon: row.icon ?? null,
    installCount: row.installCount ?? 0,
    coverImageUrl: row.coverImageUrl ?? null,
    galleryMetadata: row.galleryMetadata ?? null,
    publishedAt: toIso(row.publishedAt as Date | string | null),
  };
};

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const { id: agentId } = await params;

  if (!agentId) {
    return new Response("Missing agent id", { status: 400 });
  }

  const activeOrgId =
    (session as { activeOrgId?: string | null }).activeOrgId ?? null;

  try {
    const published = await agentInstallRepository.getPublishedAgent(agentId);
    if (!published) {
      return new Response("Agent not found or not published", { status: 404 });
    }

    const install = await agentInstallRepository.installAgent(
      { agentId, config: {} },
      userId,
      activeOrgId,
    );

    // Fire-and-forget: a slow cache bump should not block the 201
    // response. The source of truth is `agent_install`; this is just
    // a denormalized sort key on the gallery listing.
    void agentInstallRepository
      .incrementInstallCount(agentId)
      .catch((err) =>
        logger.warn(
          `incrementInstallCount failed for ${agentId} (non-fatal)`,
          err,
        ),
      );

    return Response.json(
      { installId: install.id, agent: serializeAgent(published) },
      { status: 201 },
    );
  } catch (err) {
    logger.error(`install failed for ${agentId}`, err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const { id: agentId } = await params;

  if (!agentId) {
    return new Response("Missing agent id", { status: 400 });
  }

  try {
    const removed = await agentInstallRepository.uninstallAgent(
      userId,
      agentId,
    );
    if (!removed) {
      return new Response("Install not found", { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    logger.error(`uninstall failed for ${agentId}`, err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
