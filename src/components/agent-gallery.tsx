"use client";

import { Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

// ---------------------------------------------------------------------------
// P4.D — Public agent gallery card + install button.
//
// Each card represents one published agent on the /gallery/agents
// landing page. The "Install" button is a small client island
// that POSTs to /api/agent/[id]/install. If the user is not
// signed in, the install endpoint returns 401 and we redirect to
// /sign-in?next=/gallery/agents.
//
// The view-recording POST is fire-and-forget — we don't wait for
// it before navigating.
// ---------------------------------------------------------------------------

export interface GalleryAgent {
  id: string;
  name: string;
  description: string | null;
  icon: { type: "emoji"; value: string; style?: Record<string, string> } | null;
  installCount: number;
  coverImageUrl: string | null;
  galleryMetadata: Record<string, unknown> | null;
  publishedAt: string | null;
}

interface GalleryAgentCardProps {
  agent: GalleryAgent;
}

const excerpt = (text: string | null, max = 140): string => {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

export function GalleryAgentCard({ agent }: GalleryAgentCardProps) {
  const router = useRouter();
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fire-and-forget view record — independent of install.
  const recordView = () => {
    try {
      void fetch(`/api/agent/${agent.id}/view`, { method: "POST" });
    } catch {
      // Never block render on analytics.
    }
  };

  const handleInstall = async () => {
    recordView();
    setInstalling(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.status === 401) {
        router.push(`/sign-in?next=${encodeURIComponent("/gallery/agents")}`);
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Install failed (${res.status})`);
        return;
      }
      setInstalled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstalling(false);
    }
  };

  const iconChar =
    agent.icon && agent.icon.type === "emoji" && agent.icon.value
      ? agent.icon.value
      : null;

  return (
    <Card
      className="w-full min-h-[220px] flex flex-col overflow-hidden"
      data-testid="gallery-agent-card"
      data-agent-id={agent.id}
      data-agent-name={agent.name}
    >
      {agent.coverImageUrl ? (
        <div className="relative w-full h-32 bg-secondary overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={agent.coverImageUrl}
            alt={agent.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}
      <CardHeader className="flex-1 gap-y-0">
        <CardTitle className="flex items-center gap-2 min-w-0">
          {iconChar ? (
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-base shrink-0"
              style={agent.icon?.style ?? undefined}
            >
              {iconChar}
            </span>
          ) : null}
          <span className="truncate font-medium">{agent.name}</span>
        </CardTitle>
        {agent.description ? (
          <p className="text-sm text-muted-foreground line-clamp-3 mt-2">
            {excerpt(agent.description)}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-3">
          {agent.installCount.toLocaleString()} installs
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          onClick={handleInstall}
          disabled={installing || installed}
          className="w-full"
          data-testid="gallery-agent-install"
          data-agent-id={agent.id}
        >
          {installing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Installing…
            </>
          ) : installed ? (
            <>Installed</>
          ) : (
            <>
              <Download className="size-4" />
              Install
            </>
          )}
        </Button>
        {error ? (
          <p
            className="text-xs text-destructive mt-2"
            data-testid="gallery-agent-install-error"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
