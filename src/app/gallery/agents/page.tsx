import {
  type GalleryAgent,
  GalleryAgentCard,
} from "@/components/agent-gallery";
import { agentInstallRepository } from "lib/db/repository";
import { ArrowUpRight } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { Button } from "ui/button";

// ISR — re-fetch the catalogue every 5 minutes. Pairs with the
// matching `revalidate = 300` on /api/agent/published so the
// underlying JSON and the rendered HTML stay in lock-step.
export const revalidate = 300;

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title: "Agent Gallery — Discover & Install Community AI Agents",
  description:
    "Browse and install community-built AI agents for Flare AI. Customize your workspace with specialized assistants for coding, research, productivity, and more.",
  keywords: [
    "AI agents",
    "agent gallery",
    "AI marketplace",
    "custom agents",
    "Flare AI",
    "GPT-4 agents",
    "Claude agents",
  ],
  openGraph: {
    title: "Agent Gallery — Discover & Install Community AI Agents",
    description: "Browse and install community-built AI agents for Flare AI.",
    url: `${siteUrl}/gallery/agents`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Gallery — Discover & Install Community AI Agents",
    description: "Browse and install community-built AI agents for Flare AI.",
  },
  alternates: {
    canonical: "/gallery/agents",
  },
};

// ---------------------------------------------------------------------------
// P4.D — Public agent gallery landing page.
//
// Server component. Fetches the published catalogue straight from
// the repository (skipping the HTTP round-trip — both calls hit
// the same partial `agent_published_idx` either way and the page
// is already ISR-cached at the route level).
//
// Auth: not required. Unauthenticated visitors can browse; the
// "Install" button is a client island that redirects to
// /sign-in?next=/gallery/agents on a 401 from the install route.
// ---------------------------------------------------------------------------

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value as unknown as string).toISOString();
};

export default async function AgentGalleryPage() {
  let agents: GalleryAgent[] = [];
  let fetchError: string | null = null;
  try {
    const rows = await agentInstallRepository.listPublishedAgents(50, 0);
    agents = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      icon: row.icon ?? null,
      installCount: row.installCount ?? 0,
      coverImageUrl: row.coverImageUrl ?? null,
      galleryMetadata: row.galleryMetadata ?? null,
      publishedAt: toIso(row.publishedAt as Date | string | null),
    }));
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1
          className="text-3xl font-bold tracking-tight"
          data-testid="gallery-title"
        >
          Agent Gallery
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Discover community-built AI agents. Install one with a single click to
          add it to your Flare AI workspace.
        </p>
      </header>

      {fetchError ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm"
          role="alert"
          data-testid="gallery-error"
        >
          Failed to load the gallery: {fetchError}
        </div>
      ) : null}

      {agents.length === 0 && !fetchError ? (
        <div
          className="rounded-md border bg-card p-10 text-center flex flex-col gap-3 items-center"
          data-testid="gallery-empty"
        >
          <h2 className="text-lg font-semibold">No published agents yet</h2>
          <p className="text-muted-foreground max-w-md">
            The gallery is freshly minted — check back soon, or publish your own
            from the in-app agents dashboard.
          </p>
          <Button asChild variant="outline">
            <Link href="/agents">
              Go to your agents
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : null}

      {agents.length > 0 ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="gallery-grid"
        >
          {agents.map((agent) => (
            <GalleryAgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
