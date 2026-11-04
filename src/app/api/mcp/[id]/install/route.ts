import "server-only";

import { getSession } from "auth/server";
import { mcpInstallRepository } from "lib/db/repository";
import logger from "lib/logger";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// P4.C — POST / DELETE /api/mcp/[id]/install
// ---------------------------------------------------------------------------
// Auth-gated install endpoint backing the public marketplace page.
//
// POST: install a curated MCP server for the signed-in user. Idempotent on
// (userId, mcpServerId) — re-installing upserts the config and is a no-op
// for the install row. Bumps the denormalized `mcp_server.install_count`
// best-effort (fire-and-forget) for the marketplace sort.
//
// DELETE: uninstall. Same auth model — a user can only uninstall their own
// row. Decrements the install count for the marketplace sort.
//
// SECURITY — fork or copy-on-install (see plan #14):
//   The plan explicitly requires that a marketplace MCP install must NOT
//   carry over the original owner's `mcpServerCustomization` /
//   `mcpToolCustomization` rows. We rely on the schema shape: the new
//   `mcp_server_install` row stores ONLY the install `config` and a
//   reference to the shared `mcp_server.id`. There is no column linking
//   to the customizations, and the customizations are keyed
//   (userId, mcpServerId) — they belong to the original owner's
//   (userId, mcpServerId) tuple, not to ours. So a fresh install cannot
//   inherit them. This route does NOT touch either customization table.
//   If a future "fork on install" feature is added, this comment is the
//   one to update.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing MCP server id" },
      { status: 400 },
    );
  }

  try {
    // 1. Resolve the curated server. A 404 here is the right answer for
    //    a non-existent or non-curated server — the marketplace page only
    //    links to curated ones, so a 404 means the slug/id is stale.
    const server = await mcpInstallRepository.getMarketplaceMcpServer(id);
    if (!server) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 },
      );
    }

    // 2. Upsert the install row. Idempotent on the UNIQUE
    //    (user_id, mcp_server_id) constraint. `orgId` is intentionally
    //    not passed — P4.A wires the org plugin, and until that lands
    //    we treat every install as a personal install. Once the
    //    `session.activeOrgId` field is available it should be passed
    //    as the third arg.
    const install = await mcpInstallRepository.installMcpServer(
      { mcpServerId: id, config: {} },
      userId,
    );

    // 3. Bump the install count. Fire-and-forget — a failure here is
    //    not user-visible and is safe to retry on the next install.
    void mcpInstallRepository
      .incrementInstallCount(id)
      .catch((err) => logger.warn("incrementInstallCount failed", { id, err }));

    return NextResponse.json(
      {
        installId: install.id,
        server: {
          id: server.id,
          name: server.name,
          description: server.description,
          category: server.category,
          homepageUrl: server.homepageUrl,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("MCP install failed", { id, userId, err });
    return NextResponse.json(
      { error: "Failed to install MCP server", message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing MCP server id" },
      { status: 400 },
    );
  }

  try {
    const removed = await mcpInstallRepository.uninstallMcpServer(userId, id);
    if (!removed) {
      return NextResponse.json(
        { error: "MCP server is not installed" },
        { status: 404 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("MCP uninstall failed", { id, userId, err });
    return NextResponse.json(
      { error: "Failed to uninstall MCP server", message },
      { status: 500 },
    );
  }
}
