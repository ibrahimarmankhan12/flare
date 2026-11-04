import "server-only";

import { getSession } from "auth/server";
import { mcpInstallRepository } from "lib/db/repository";

import {
  MarketplaceMcpGrid,
  type MarketplaceMcpServer,
} from "@/components/mcp-marketplace";

// ---------------------------------------------------------------------------
// P4.C — /marketplace/mcp
// ---------------------------------------------------------------------------
// Public read-only marketplace listing the editor-curated MCP servers.
// Backed by `mcpInstallRepository.listCuratedMcpServers(50, 0)` and
// revalidated every 5 minutes via ISR. Sign-in state is detected server-
// side so the "Install" button can render in the right state without
// flashing a sign-in redirect on the client.
//
// The /api/mcp/curated endpoint exposes the same data for non-Next.js
// clients (e.g. the mobile app, a future SDK).
// ---------------------------------------------------------------------------

export const revalidate = 300;

export const metadata = {
  title: "MCP Server Marketplace — Flare AI",
  description:
    "Discover curated Model Context Protocol (MCP) servers to extend Flare AI with tools, integrations, and data sources.",
};

export default async function McpMarketplacePage() {
  const [session, servers] = await Promise.all([
    getSession(),
    mcpInstallRepository.listCuratedMcpServers(50, 0),
  ]);

  const isSignedIn = Boolean(session?.user?.id);

  // Project to the public-shape (matches /api/mcp/curated exactly so the
  // two never drift). Dates are passed through as ISO strings — Next.js
  // will hydrate the client component with serializable props.
  const publicServers: MarketplaceMcpServer[] = servers.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    category: s.category ?? null,
    installCount: s.installCount ?? 0,
    homepageUrl: s.homepageUrl ?? null,
    createdAt:
      s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  }));

  return (
    <main className="min-h-screen w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            MCP Server Marketplace
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
            One-click install for editor-curated Model Context Protocol servers.
            Each server is reviewed for quality and security before being listed
            here.
          </p>
        </header>

        <section aria-label="Curated MCP servers">
          <MarketplaceMcpGrid servers={publicServers} isSignedIn={isSignedIn} />
        </section>
      </div>
    </main>
  );
}
