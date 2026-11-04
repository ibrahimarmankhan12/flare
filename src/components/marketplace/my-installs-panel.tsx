"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MCPIcon } from "@/components/ui/mcp-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "lib/utils";
import { ExternalLink, Package, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

// ---------------------------------------------------------------------------
// P4.E — My Installs panel (MCP)
//
// A small client component that lists the current user's installed MCP
// servers (data from /api/mcp/installed) and lets them uninstall any
// row. Designed to be embedded inside the existing MCP dashboard tab
// or rendered as a standalone page section.
//
// Uninstall DELETEs /api/mcp/[id]/install (which P4.C owns). On success
// the local SWR cache is revalidated so the panel updates without a
// full page reload.
// ---------------------------------------------------------------------------

export interface InstalledMcpServer {
  installId: string;
  server: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    installCount: number;
    curated: boolean;
    homepageUrl: string | null;
    visibility: string;
  };
  config: Record<string, unknown>;
  installedAt: string;
  orgId: string | null;
}

interface InstallsResponse {
  installs: InstalledMcpServer[];
}

export function MyInstallsPanel() {
  const {
    data,
    isLoading,
    error,
    mutate: revalidate,
  } = useSWR<InstallsResponse>("/api/mcp/installed", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  const uninstall = useCallback(
    async (serverId: string, serverName: string) => {
      setUninstallingId(serverId);
      try {
        const res = await fetch(`/api/mcp/${serverId}/install`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errorBody = await res
            .json()
            .catch(() => ({ message: "Uninstall failed" }));
          throw new Error(errorBody.message || "Uninstall failed");
        }
        toast.success(`Uninstalled ${serverName}`);
        await revalidate();
        // Also bust the global MCP list cache so the main dashboard
        // reflects the uninstall on next visit.
        void mutate("/api/mcp/list");
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
      toast.error("Failed to load installed MCP servers");
    }
  }, [error]);

  if (isLoading) {
    return <MyInstallsSkeleton />;
  }

  const installs = data?.installs ?? [];

  if (installs.length === 0) {
    return (
      <Card data-testid="my-installs-empty">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="rounded-full bg-muted p-2">
            <Package className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">
              No installed MCP servers
            </CardTitle>
            <CardDescription>
              Browse the marketplace to install your first server.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/marketplace/mcp">Browse marketplace</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="my-installs-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-muted-foreground">
            My installed MCP servers
          </h2>
          <p className="text-xs text-muted-foreground">
            {installs.length} server{installs.length === 1 ? "" : "s"} installed
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/marketplace/mcp">
            <ExternalLink className="mr-1 size-3.5" />
            Browse marketplace
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {installs.map((install) => {
          const isBusy = uninstallingId === install.server.id;
          return (
            <Card
              key={install.installId}
              className="border-border/60"
              data-testid="my-install-row"
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 p-4">
                <div className="rounded-md bg-muted p-2 shrink-0">
                  <MCPIcon className="size-4 fill-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold truncate">
                      {install.server.name}
                    </CardTitle>
                    {install.server.curated && (
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                        Curated
                      </span>
                    )}
                    {install.server.category && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {install.server.category}
                      </span>
                    )}
                  </div>
                  {install.server.description && (
                    <CardDescription className="text-xs mt-1 line-clamp-2">
                      {install.server.description}
                    </CardDescription>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Installed{" "}
                    {new Date(install.installedAt).toLocaleDateString()} ·{" "}
                    {install.server.installCount} total install
                    {install.server.installCount === 1 ? "" : "s"}
                    {install.orgId ? ` · team` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() =>
                    uninstall(install.server.id, install.server.name)
                  }
                  disabled={isBusy}
                  data-testid="uninstall-button"
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

function MyInstallsSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      data-testid="my-installs-loading"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
