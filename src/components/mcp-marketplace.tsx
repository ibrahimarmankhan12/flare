"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { MCPIcon } from "ui/mcp-icon";

// ---------------------------------------------------------------------------
// P4.C — Marketplace MCP server card + grid
// ---------------------------------------------------------------------------
// Server-shape returned by GET /api/mcp/curated. Only the marketplace-safe
// fields are forwarded (no `config`, no `userId`).
// ---------------------------------------------------------------------------

export type MarketplaceMcpServer = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  installCount: number;
  homepageUrl: string | null;
  createdAt: Date | string;
};

export interface MarketplaceMcpCardProps {
  server: MarketplaceMcpServer;
  /** Pass `false` for unauthenticated viewers; the button will redirect to sign-in. */
  isSignedIn: boolean;
}

export function MarketplaceMcpCard({
  server,
  isSignedIn,
}: MarketplaceMcpCardProps) {
  const router = useRouter();
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstall = async () => {
    if (!isSignedIn) {
      router.push(`/sign-in?next=/marketplace/mcp`);
      return;
    }
    if (isInstalling) return;
    setIsInstalling(true);
    try {
      const res = await fetch(
        `/api/mcp/${encodeURIComponent(server.id)}/install`,
        { method: "POST", headers: { "content-type": "application/json" } },
      );
      if (res.status === 401) {
        router.push(`/sign-in?next=/marketplace/mcp`);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(body.error ?? "Failed to install MCP server");
        return;
      }
      toast.success(`Installed ${server.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(message);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Card
      data-testid="marketplace-mcp-card"
      data-mcp-id={server.id}
      className="flex flex-col gap-3"
    >
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="rounded-md bg-secondary p-2 shrink-0">
          <MCPIcon className="size-4 fill-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{server.name}</CardTitle>
          {server.category ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {server.category}
            </p>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {server.installCount.toLocaleString()}{" "}
          {server.installCount === 1 ? "install" : "installs"}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {server.description ? (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {server.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description provided.
          </p>
        )}
        <div className="flex items-center gap-2 mt-auto">
          {server.homepageUrl ? (
            <a
              href={server.homepageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Homepage
            </a>
          ) : null}
          <div className="flex-1" />
          <Button
            onClick={handleInstall}
            disabled={isInstalling}
            size="sm"
            data-testid="marketplace-mcp-install"
          >
            {isInstalling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {isSignedIn ? "Install" : "Sign in to install"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export interface MarketplaceMcpGridProps {
  servers: MarketplaceMcpServer[];
  isSignedIn: boolean;
}

export function MarketplaceMcpGrid({
  servers,
  isSignedIn,
}: MarketplaceMcpGridProps) {
  if (servers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">
          No curated MCP servers yet. Check back soon — the marketplace is being
          seeded by the Flare team.
        </p>
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      data-testid="marketplace-mcp-grid"
    >
      {servers.map((server) => (
        <MarketplaceMcpCard
          key={server.id}
          server={server}
          isSignedIn={isSignedIn}
        />
      ))}
    </div>
  );
}
