"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "lib/utils";
import { Bot, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

// ---------------------------------------------------------------------------
// P4.E — My Installed Agents panel (Agent gallery)
//
// A small client component that lists the current user's installed
// gallery agents (data from /api/agent/installed) and lets them
// uninstall any row. Designed to be embedded inside the agents-list
// page (P4.D's surface) or rendered as a standalone section.
//
// Uninstall DELETEs /api/agent/[id]/install (which P4.D owns). On
// success the local SWR cache is revalidated so the panel updates
// without a full page reload.
// ---------------------------------------------------------------------------

export interface InstalledAgent {
  installId: string;
  agent: {
    id: string;
    name: string;
    description: string | null;
    icon: { type: string; value: string } | null;
    publishedAt: string | null;
    installCount: number;
    coverImageUrl: string | null;
    galleryMetadata: Record<string, unknown> | null;
    visibility: string;
  };
  config: Record<string, unknown>;
  installedAt: string;
  orgId: string | null;
}

interface InstalledAgentsResponse {
  agents: InstalledAgent[];
}

export function MyInstalledAgents() {
  const {
    data,
    isLoading,
    error,
    mutate: revalidate,
  } = useSWR<InstalledAgentsResponse>("/api/agent/installed", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  const uninstall = useCallback(
    async (agentId: string, agentName: string) => {
      setUninstallingId(agentId);
      try {
        const res = await fetch(`/api/agent/${agentId}/install`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errorBody = await res
            .json()
            .catch(() => ({ message: "Uninstall failed" }));
          throw new Error(errorBody.message || "Uninstall failed");
        }
        toast.success(`Uninstalled ${agentName}`);
        await revalidate();
        // Bust the global agents list cache so the main agents page
        // reflects the uninstall on next visit.
        void mutate("/api/agent?filters=mine,shared");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to uninstall";
        toast.error(message);
      } finally {
        setUninstallingId(null);
      }
    },
    [revalidate],
  );

  // If a downstream route navigated to us with a success/error flash,
  // surface it once.
  useEffect(() => {
    if (error) {
      toast.error("Failed to load installed agents");
    }
  }, [error]);

  if (isLoading) {
    return <MyInstalledAgentsSkeleton />;
  }

  const agents = data?.agents ?? [];

  if (agents.length === 0) {
    return (
      <Card data-testid="my-installed-agents-empty">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="rounded-full bg-muted p-2">
            <Bot className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">No installed agents</CardTitle>
            <CardDescription>
              Browse the gallery to install your first agent.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/gallery/agents">Browse gallery</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="my-installed-agents-panel"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-muted-foreground">
            My installed agents
          </h2>
          <p className="text-xs text-muted-foreground">
            {agents.length} agent{agents.length === 1 ? "" : "s"} installed
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/gallery/agents">
            <ExternalLink className="mr-1 size-3.5" />
            Browse gallery
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {agents.map((entry) => {
          const isBusy = uninstallingId === entry.agent.id;
          return (
            <Card
              key={entry.installId}
              className="border-border/60"
              data-testid="my-installed-agent-row"
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 p-4">
                <div className="rounded-md bg-muted p-2 shrink-0">
                  <Bot className="size-4 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold truncate">
                      {entry.agent.name}
                    </CardTitle>
                    {entry.agent.publishedAt && (
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                        Published
                      </span>
                    )}
                  </div>
                  {entry.agent.description && (
                    <CardDescription className="text-xs mt-1 line-clamp-2">
                      {entry.agent.description}
                    </CardDescription>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Installed {new Date(entry.installedAt).toLocaleDateString()}{" "}
                    · {entry.agent.installCount} total install
                    {entry.agent.installCount === 1 ? "" : "s"}
                    {entry.orgId ? ` · team` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => uninstall(entry.agent.id, entry.agent.name)}
                  disabled={isBusy}
                  data-testid="uninstall-agent-button"
                >
                  <Trash2 className="mr-1 size-3.5" />
                  Uninstall
                </Button>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MyInstalledAgentsSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      data-testid="my-installed-agents-loading"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
