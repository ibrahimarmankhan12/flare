"use client";

import { ConnectorLogoIcon } from "@/components/ui/connector-logo-icon";
import { Button } from "ui/button";
import { cn } from "lib/utils";
import {
  ArrowUpRight,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ConnectorProvider =
  | "gmail"
  | "google-drive"
  | "google-calendar"
  | "google-docs"
  | "google-forms"
  | "google-keep"
  | "google-meet"
  | "google-sheets"
  | "google-slides"
  | "google-tasks"
  | "youtube"
  | "outlook"
  | "slack"
  | "notion"
  | "github"
  | "confluence"
  | "jira"
  | "linear"
  | "asana"
  | "clickup"
  | "productboard"
  | "testrail"
  | "coda"
  | "outline"
  | "slab"
  | "guru"
  | "highspot"
  | "document360"
  | "gitlab"
  | "bitbucket"
  | "dropbox"
  | "zendesk"
  | "freshdesk"
  | "salesforce"
  | "hubspot"
  | "airtable"
  | "gong"
  | "egnyte"
  | "teams"
  | "discord"
  | "bookstack"
  | "gitbook"
  | "canvas"
  | "loopio"
  | "discourse"
  | "xenforo"
  | "drupal-wiki"
  | "axero"
  | "zulip"
  | "mediawiki"
  | "fireflies"
  | "wikipedia";

export type { ConnectorProvider };

export interface ConnectorViewModel {
  provider: ConnectorProvider;
  name: string;
  description: string;
  category:
    | "Google"
    | "Microsoft"
    | "Workspace"
    | "Code"
    | "Atlassian"
    | "Trackers"
    | "Docs"
    | "Storage"
    | "Support"
    | "Sales"
    | "Communication"
    | "Server-token";
  isAvailable: boolean;
  isConnected: boolean;
  isPaused: boolean;
  email: string | null;
  lastSyncAt: string | null;
  updatedAt: string | null;
}

interface ConnectorsSettingsViewProps {
  connectors: ConnectorViewModel[];
  stats: {
    connected: number;
    paused: number;
    available: number;
    total: number;
  };
}

const PROVIDER_ICONS: Record<ConnectorProvider, React.ReactNode> = {
  gmail: <ConnectorLogoIcon provider="gmail" className="size-5" />,
  "google-drive": (
    <ConnectorLogoIcon provider="google-drive" className="size-5" />
  ),
  "google-calendar": (
    <ConnectorLogoIcon provider="google-calendar" className="size-5" />
  ),
  "google-docs": (
    <ConnectorLogoIcon provider="google-docs" className="size-5" />
  ),
  "google-forms": (
    <ConnectorLogoIcon provider="google-forms" className="size-5" />
  ),
  "google-keep": (
    <ConnectorLogoIcon provider="google-keep" className="size-5" />
  ),
  "google-meet": (
    <ConnectorLogoIcon provider="google-meet" className="size-5" />
  ),
  "google-sheets": (
    <ConnectorLogoIcon provider="google-sheets" className="size-5" />
  ),
  "google-slides": (
    <ConnectorLogoIcon provider="google-slides" className="size-5" />
  ),
  "google-tasks": (
    <ConnectorLogoIcon provider="google-tasks" className="size-5" />
  ),
  youtube: <ConnectorLogoIcon provider="youtube" className="size-5" />,
  outlook: <ConnectorLogoIcon provider="outlook" className="size-5" />,
  slack: <ConnectorLogoIcon provider="slack" className="size-5" />,
  notion: <ConnectorLogoIcon provider="notion" className="size-5" />,
  github: <ConnectorLogoIcon provider="github" className="size-5" />,
  confluence: <ConnectorLogoIcon provider="confluence" className="size-5" />,
  jira: <ConnectorLogoIcon provider="jira" className="size-5" />,
  linear: <ConnectorLogoIcon provider="linear" className="size-5" />,
  asana: <ConnectorLogoIcon provider="asana" className="size-5" />,
  clickup: <ConnectorLogoIcon provider="clickup" className="size-5" />,
  productboard: (
    <ConnectorLogoIcon provider="productboard" className="size-5" />
  ),
  testrail: <ConnectorLogoIcon provider="testrail" className="size-5" />,
  coda: <ConnectorLogoIcon provider="coda" className="size-5" />,
  outline: <ConnectorLogoIcon provider="outline" className="size-5" />,
  slab: <ConnectorLogoIcon provider="slab" className="size-5" />,
  guru: <ConnectorLogoIcon provider="guru" className="size-5" />,
  highspot: <ConnectorLogoIcon provider="highspot" className="size-5" />,
  document360: <ConnectorLogoIcon provider="document360" className="size-5" />,
  gitlab: <ConnectorLogoIcon provider="gitlab" className="size-5" />,
  bitbucket: <ConnectorLogoIcon provider="bitbucket" className="size-5" />,
  dropbox: <ConnectorLogoIcon provider="dropbox" className="size-5" />,
  zendesk: <ConnectorLogoIcon provider="zendesk" className="size-5" />,
  freshdesk: <ConnectorLogoIcon provider="freshdesk" className="size-5" />,
  salesforce: <ConnectorLogoIcon provider="salesforce" className="size-5" />,
  hubspot: <ConnectorLogoIcon provider="hubspot" className="size-5" />,
  airtable: <ConnectorLogoIcon provider="airtable" className="size-5" />,
  gong: <ConnectorLogoIcon provider="gong" className="size-5" />,
  egnyte: <ConnectorLogoIcon provider="egnyte" className="size-5" />,
  teams: <ConnectorLogoIcon provider="teams" className="size-5" />,
  discord: <ConnectorLogoIcon provider="discord" className="size-5" />,
  bookstack: <ConnectorLogoIcon provider="bookstack" className="size-5" />,
  gitbook: <ConnectorLogoIcon provider="gitbook" className="size-5" />,
  canvas: <ConnectorLogoIcon provider="canvas" className="size-5" />,
  loopio: <ConnectorLogoIcon provider="loopio" className="size-5" />,
  discourse: <ConnectorLogoIcon provider="discourse" className="size-5" />,
  xenforo: <ConnectorLogoIcon provider="xenforo" className="size-5" />,
  "drupal-wiki": (
    <ConnectorLogoIcon provider="drupal-wiki" className="size-5" />
  ),
  axero: <ConnectorLogoIcon provider="axero" className="size-5" />,
  zulip: <ConnectorLogoIcon provider="zulip" className="size-5" />,
  mediawiki: <ConnectorLogoIcon provider="mediawiki" className="size-5" />,
  fireflies: <ConnectorLogoIcon provider="fireflies" className="size-5" />,
  wikipedia: <ConnectorLogoIcon provider="wikipedia" className="size-5" />,
};

const formatLastSync = (iso: string | null): string => {
  if (!iso) return "Never synced";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
};

const CATEGORY_ORDER: Array<ConnectorViewModel["category"]> = [
  "Google",
  "Microsoft",
  "Atlassian",
  "Workspace",
  "Code",
  "Trackers",
  "Docs",
  "Storage",
  "Support",
  "Communication",
  "Sales",
  "Server-token",
];

export function ConnectorsSettingsView({
  connectors,
  stats,
}: ConnectorsSettingsViewProps) {
  const [items, setItems] = useState<ConnectorViewModel[]>(connectors);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "connected" | "available">(
    "all",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    setItems(connectors);
  }, [connectors]);

  const fetchConnectors = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/connectors");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as {
        connectors: Array<{
          provider: ConnectorProvider;
          isConnected: boolean;
          isPaused: boolean;
          email?: string | null;
          lastSyncAt?: string | null;
        }>;
      };
      // Merge API data into the existing items so we keep category /
      // description fields the API doesn't return.
      setItems((prev) =>
        prev.map((c) => {
          const fresh = data.connectors.find((d) => d.provider === c.provider);
          if (!fresh) return c;
          return {
            ...c,
            isConnected: fresh.isConnected,
            isPaused: fresh.isPaused,
            email: fresh.email ?? c.email,
            lastSyncAt: fresh.lastSyncAt ?? c.lastSyncAt,
          };
        }),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Listen for OAuth popup completion (same protocol as the popover).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "CONNECTOR_OAUTH_SUCCESS") {
        toast.success(`${event.data.provider} connected`);
        setActionLoading(null);
        fetchConnectors();
      } else if (event.data?.type === "CONNECTOR_OAUTH_ERROR") {
        toast.error(
          `Failed to connect ${event.data.provider}: ${event.data.error}`,
        );
        setActionLoading(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fetchConnectors]);

  const handleConnect = useCallback(
    async (provider: ConnectorProvider) => {
      setActionLoading(provider);
      try {
        const res = await fetch(`/api/connectors/${provider}/authorize`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err.error || "Failed to initiate connection");
        }
        const { authUrl } = (await res.json()) as { authUrl: string };
        const popup = window.open(
          authUrl,
          "connector-oauth",
          "width=600,height=700,scrollbars=yes,resizable=yes",
        );
        if (!popup) {
          toast.error("Please allow popups for authentication");
          setActionLoading(null);
          return;
        }
        const closed = setInterval(() => {
          if (popup.closed) {
            clearInterval(closed);
            setActionLoading(null);
            fetchConnectors();
          }
        }, 1000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect");
        setActionLoading(null);
      }
    },
    [fetchConnectors],
  );

  const handleDisconnect = useCallback(
    async (provider: ConnectorProvider) => {
      setActionLoading(provider);
      try {
        const res = await fetch(`/api/connectors/${provider}/disconnect`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        toast.success(`${provider} disconnected`);
        await fetchConnectors();
      } catch {
        toast.error("Failed to disconnect");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchConnectors],
  );

  const handlePause = useCallback(
    async (provider: ConnectorProvider) => {
      setActionLoading(provider);
      try {
        const res = await fetch(`/api/connectors/${provider}/pause`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        toast.success(`${provider} sync paused`);
        await fetchConnectors();
      } catch {
        toast.error("Failed to pause sync");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchConnectors],
  );

  const handleResume = useCallback(
    async (provider: ConnectorProvider) => {
      setActionLoading(provider);
      try {
        const res = await fetch(`/api/connectors/${provider}/resume`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        toast.success(`${provider} sync resumed`);
        await fetchConnectors();
      } catch {
        toast.error("Failed to resume sync");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchConnectors],
  );

  const handleDelete = useCallback(
    async (provider: ConnectorProvider) => {
      if (
        !confirm(
          `Delete the ${provider} connection? This wipes stored tokens and history.`,
        )
      ) {
        return;
      }
      setActionLoading(provider);
      try {
        const res = await fetch(`/api/connectors/${provider}/delete`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        toast.success(`${provider} connection deleted`);
        await fetchConnectors();
      } catch {
        toast.error("Failed to delete connection");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchConnectors],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (filter === "connected" && !c.isConnected) return false;
      if (filter === "available" && !c.isAvailable) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [items, query, filter]);

  const grouped = useMemo(() => {
    const map = new Map<ConnectorViewModel["category"], ConnectorViewModel[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const c of filtered) map.get(c.category)?.push(c);
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: map.get(cat) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-[#0a0a0a] text-white">
      {/* Ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 80% 0%, rgba(61,158,140,0.10), transparent 60%), radial-gradient(ellipse 60% 40% at 0% 100%, rgba(61,158,140,0.05), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:px-10 sm:py-16">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-[#3d9e8c] shadow-[0_0_8px_rgba(61,158,140,0.7)]"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
                Settings · External sources
              </span>
            </div>
            <button
              type="button"
              onClick={fetchConnectors}
              disabled={refreshing}
              className="group/refresh inline-flex size-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/55 transition-all hover:border-[#3d9e8c]/40 hover:bg-[#3d9e8c]/10 hover:text-[#3d9e8c] disabled:opacity-50"
              aria-label="Refresh connectors"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
            </button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <h1 className="font-cooper text-5xl font-light leading-[0.95] tracking-tight text-white sm:text-7xl">
                External <em className="italic text-[#3d9e8c]">sources</em>
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-white/55">
                Connect your apps so Flare can read, write, and reason over
                them. Tokens are stored encrypted; you can pause or revoke
                access at any time.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-[#3d9e8c]/30 bg-[#3d9e8c]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#3d9e8c]">
              <span className="inline-block size-1.5 rounded-full bg-[#3d9e8c] shadow-[0_0_6px_rgba(61,158,140,0.7)]" />
              {stats.connected} of {stats.available} live
              {stats.paused > 0 ? ` · ${stats.paused} paused` : ""}
            </div>
          </div>
        </header>

        {/* ── Stats strip ─────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Connected"
            value={stats.connected}
            sub="Active integrations"
            tone="active"
          />
          <StatTile
            label="Paused"
            value={stats.paused}
            sub="Sync halted by you"
            tone={stats.paused > 0 ? "warning" : "muted"}
          />
          <StatTile
            label="Available"
            value={stats.available}
            sub={`of ${stats.total} providers`}
            tone="muted"
          />
          <StatTile
            label="Coverage"
            value={
              stats.available > 0
                ? `${Math.round((stats.connected / stats.available) * 100)}%`
                : "—"
            }
            sub="of available sources"
            tone={stats.connected > 0 ? "accent" : "muted"}
          />
        </section>

        {/* ── Filters ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FilterPill
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label={`All · ${items.length}`}
            />
            <FilterPill
              active={filter === "connected"}
              onClick={() => setFilter("connected")}
              label={`Connected · ${items.filter((i) => i.isConnected).length}`}
            />
            <FilterPill
              active={filter === "available"}
              onClick={() => setFilter("available")}
              label={`Available · ${items.filter((i) => i.isAvailable).length}`}
            />
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search providers…"
              className="h-9 w-full rounded-full border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 font-mono text-[11px] uppercase tracking-[0.15em] text-white/85 placeholder:text-white/30 placeholder:normal-case placeholder:tracking-normal focus:border-[#3d9e8c]/40 focus:outline-none focus:ring-2 focus:ring-[#3d9e8c]/20"
            />
          </div>
        </section>

        {/* ── Connector groups ────────────────────────────────── */}
        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-12 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
              No connectors match your filters
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {grouped.map((group) => (
              <section key={group.category} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
                    {group.category}
                  </span>
                  <div className="h-px flex-1 border-t border-dashed border-white/10" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "provider" : "providers"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.items.map((connector, idx) => (
                    <ConnectorCard
                      key={connector.provider}
                      connector={connector}
                      icon={PROVIDER_ICONS[connector.provider]}
                      index={idx + 1}
                      isLoading={actionLoading === connector.provider}
                      onConnect={() => handleConnect(connector.provider)}
                      onDisconnect={() => handleDisconnect(connector.provider)}
                      onPause={() => handlePause(connector.provider)}
                      onResume={() => handleResume(connector.provider)}
                      onDelete={() => handleDelete(connector.provider)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ── Footer note ─────────────────────────────────────── */}
        <footer className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-xs leading-relaxed text-white/40">
            Tokens are encrypted at rest. Revoking access here will sign the
            provider out and remove stored credentials — your existing chats and
            data are untouched.
          </p>
          <a
            href="https://docs.example.com/connectors"
            target="_blank"
            rel="noreferrer"
            className="group/docs inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-white/50 transition-colors hover:text-[#3d9e8c]"
          >
            Read the docs
            <ArrowUpRight className="size-3 transition-transform group-hover/docs:-translate-y-0.5 group-hover/docs:translate-x-0.5" />
          </a>
        </footer>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub: string;
  tone: "active" | "warning" | "accent" | "muted";
}) {
  const valueColor = {
    active: "text-[#3d9e8c]",
    warning: "text-amber-300",
    accent: "text-[#3d9e8c]",
    muted: "text-white",
  }[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white/[0.02] p-5 transition-colors hover:border-white/[0.15]",
        tone === "active"
          ? "border-[#3d9e8c]/30"
          : tone === "warning"
            ? "border-amber-300/25"
            : "border-white/[0.07]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
          {label}
        </span>
        {tone === "active" && (
          <span className="inline-block size-1.5 rounded-full bg-[#3d9e8c] shadow-[0_0_6px_rgba(61,158,140,0.7)]" />
        )}
        {tone === "warning" && (
          <span className="inline-block size-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.7)]" />
        )}
      </div>
      <div
        className={cn(
          "mt-3 font-cooper text-3xl font-light leading-tight tracking-tight",
          valueColor,
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        {sub}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 font-mono text-[10px] uppercase tracking-[0.2em] transition-all",
        active
          ? "border-[#3d9e8c]/40 bg-[#3d9e8c]/10 text-[#3d9e8c]"
          : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/20 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

function ConnectorCard({
  connector,
  icon,
  index,
  isLoading,
  onConnect,
  onDisconnect,
  onPause,
  onResume,
  onDelete,
}: {
  connector: ConnectorViewModel;
  icon: React.ReactNode;
  index: number;
  isLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const isConnected = connector.isConnected;
  const isPaused = connector.isPaused;
  const isAvailable = connector.isAvailable;

  const led = isConnected
    ? isPaused
      ? "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.7)]"
      : "bg-[#3d9e8c] shadow-[0_0_6px_rgba(61,158,140,0.7)]"
    : isAvailable
      ? "bg-white/15"
      : "bg-white/8";

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[#0a0a0a] transition-colors",
        isConnected
          ? "border-[#3d9e8c]/25"
          : "border-white/[0.07] hover:border-white/[0.15]",
      )}
    >
      {/* Top hairline accent when connected */}
      {isConnected && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3d9e8c]/50 to-transparent"
        />
      )}

      {/* Subtle grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
        }}
      />

      <div className="relative flex flex-col gap-5 p-6">
        {/* Header row: index, icon tile, status LED */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg border transition-colors",
                  isConnected
                    ? isPaused
                      ? "border-amber-300/30 bg-amber-300/[0.06]"
                      : "border-[#3d9e8c]/30 bg-[#3d9e8c]/[0.08]"
                    : "border-white/[0.08] bg-white/[0.02]",
                )}
              >
                {icon || <Mail className="size-5 text-white/40" />}
              </div>
              <span
                aria-hidden
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 inline-block size-2 rounded-full ring-2 ring-[#0a0a0a]",
                  led,
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-cooper text-xl font-light leading-tight tracking-tight text-white">
                  {connector.name}
                </span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">
                No. {String(index).padStart(2, "0")} · {connector.category}
              </span>
            </div>
          </div>
          <StatusBadge
            isConnected={isConnected}
            isPaused={isPaused}
            isAvailable={isAvailable}
          />
        </div>

        {/* Description */}
        <p className="text-[13px] leading-relaxed text-white/55">
          {connector.description}
        </p>

        {/* Meta strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          {isConnected && connector.email ? (
            <>
              <span className="text-white/30">Account</span>
              <span className="truncate lowercase tracking-normal text-white/70">
                {connector.email}
              </span>
            </>
          ) : (
            <>
              <span className="text-white/30">Access</span>
              <span>
                {isAvailable
                  ? isConnected
                    ? "Granted"
                    : "OAuth 2.0 ready"
                  : "Not configured"}
              </span>
            </>
          )}
          {isConnected && (
            <>
              <span className="inline-block size-0.5 rounded-full bg-white/20" />
              <Clock className="size-2.5" />
              <span>Synced {formatLastSync(connector.lastSyncAt)}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          {isLoading ? (
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
              <Loader2 className="size-3 animate-spin text-[#3d9e8c]" />
              Working
            </span>
          ) : !isAvailable && !isConnected ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30">
              Coming soon
            </span>
          ) : isConnected ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <ActionChip
                onClick={isPaused ? onResume : onPause}
                label={isPaused ? "Resume" : "Pause"}
                icon={
                  isPaused ? (
                    <Play className="size-3" />
                  ) : (
                    <Pause className="size-3" />
                  )
                }
              />
              <ActionChip
                onClick={onDisconnect}
                label="Disconnect"
                icon={<Unlink className="size-3" />}
                variant="warn"
              />
              <ActionChip onClick={onDelete} label="Delete" variant="danger" />
            </div>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
              Awaiting authorization
            </span>
          )}

          {!isConnected && isAvailable && !isLoading && (
            <Button
              onClick={onConnect}
              className={cn(
                "group/btn relative h-9 overflow-hidden rounded-full px-4",
                "border border-[#3d9e8c]/30 bg-[#3d9e8c]/10 font-mono text-[10px] uppercase tracking-[0.2em] text-[#3d9e8c]",
                "transition-all hover:border-[#3d9e8c]/60 hover:bg-[#3d9e8c] hover:text-black",
              )}
            >
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#3d9e8c]/30 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full"
              />
              <Plus className="size-3" />
              Connect
              <ExternalLink className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({
  isConnected,
  isPaused,
  isAvailable,
}: {
  isConnected: boolean;
  isPaused: boolean;
  isAvailable: boolean;
}) {
  const config =
    !isAvailable && !isConnected
      ? {
          label: "Soon",
          className: "border-white/[0.08] bg-white/[0.02] text-white/40",
        }
      : isConnected && isPaused
        ? {
            label: "Paused",
            className: "border-amber-300/30 bg-amber-300/[0.08] text-amber-300",
          }
        : isConnected
          ? {
              label: "Online",
              className:
                "border-[#3d9e8c]/30 bg-[#3d9e8c]/[0.10] text-[#3d9e8c]",
            }
          : {
              label: "Offline",
              className: "border-white/[0.08] bg-white/[0.02] text-white/55",
            };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.25em]",
        config.className,
      )}
    >
      <ChevronRight className="size-2" />
      {config.label}
    </span>
  );
}

function ActionChip({
  onClick,
  label,
  icon,
  variant = "default",
}: {
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "warn" | "danger";
}) {
  const styles = {
    default:
      "border-white/[0.08] bg-white/[0.02] text-white/65 hover:border-white/20 hover:bg-white/[0.05] hover:text-white",
    warn: "border-amber-300/20 bg-amber-300/[0.04] text-amber-200 hover:border-amber-300/40 hover:bg-amber-300/[0.08]",
    danger:
      "border-rose-400/20 bg-rose-400/[0.04] text-rose-300 hover:border-rose-400/40 hover:bg-rose-400/[0.08]",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-all",
        styles,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
