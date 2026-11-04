import "server-only";

import { mcpInstallRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// P4.C — GET /api/mcp/curated
// ---------------------------------------------------------------------------
// Public read endpoint that lists the editor-curated MCP servers. Backed by
// `mcpInstallRepository.listCuratedMcpServers(50, 0)` (uses the
// `mcp_server_curated_idx` compound index added in migration 0025).
//
// Cache strategy: ISR with a 5-minute revalidation window. The set of
// curated servers is editorial (rarely changes) and the install_count cache
// is itself a best-effort approximation, so 5 min staleness is acceptable.
// The page at `/marketplace/mcp` is similarly cached.
// ---------------------------------------------------------------------------

// Static at build time + ISR every 5 minutes.
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  try {
    const servers = await mcpInstallRepository.listCuratedMcpServers(50, 0);

    // Only the marketplace-shaped fields are forwarded — the full row
    // carries `config` (with the server's secrets), `userId`, etc. that
    // should never leak to anonymous readers.
    return NextResponse.json({
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        installCount: s.installCount,
        homepageUrl: s.homepageUrl,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to list curated MCP servers", message },
      { status: 500 },
    );
  }
}
