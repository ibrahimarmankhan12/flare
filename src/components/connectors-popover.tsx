"use client";

import { Button } from "@/components/ui/button";
import { ConnectorLogoIcon } from "@/components/ui/connector-logo-icon";
import { ConnectorsIcon } from "@/components/ui/connectors-icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ConnectorInfo {
  provider: string;
  name: string;
  description: string;
  icon: string;
  isConnected: boolean;
  isAvailable: boolean;
  isPaused: boolean;
  email?: string;
  lastSyncAt?: string;
}

interface ConnectorsPopoverProps {
  disabled?: boolean;
  className?: string;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
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

const formatLastSync = (iso: string | undefined): string => {
  if (!iso) return "never";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
};

export function ConnectorsPopover({
  disabled,
  className,
}: ConnectorsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/connectors");
      if (response.ok) {
        const data = await response.json();
        setConnectors(data.connectors || []);
      }
    } catch (error) {
      console.error("Failed to fetch connectors:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchConnectors();
    }
  }, [open, fetchConnectors]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === "CONNECTOR_OAUTH_SUCCESS") {
        toast.success(`${event.data.provider} connected successfully!`);
        fetchConnectors();
        setActionLoading(null);
      } else if (event.data?.type === "CONNECTOR_OAUTH_ERROR") {
        toast.error(
          `Failed to connect ${event.data.provider}: ${event.data.error}`,
        );
        setActionLoading(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchConnectors]);

  const handleConnect = async (provider: string) => {
    setActionLoading(provider);
    try {
      const response = await fetch(`/api/connectors/${provider}/authorize`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate connection");
      }

      const { authUrl } = await response.json();

      // Open OAuth popup
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

      // Check if popup was closed without completing
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setActionLoading(null);
          fetchConnectors();
        }
      }, 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect");
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setActionLoading(provider);
    try {
      const response = await fetch(`/api/connectors/${provider}/disconnect`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      toast.success(`${provider} disconnected`);
      fetchConnectors();
    } catch (_error) {
      toast.error("Failed to disconnect");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (provider: string) => {
    setActionLoading(provider);
    try {
      const response = await fetch(`/api/connectors/${provider}/pause`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to pause sync");
      }

      const data = await response.json();
      toast.success(
        data.status === "resumed"
          ? `${provider} sync resumed`
          : `${provider} sync paused`,
      );
      fetchConnectors();
    } catch (_error) {
      toast.error("Failed to pause sync");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (provider: string) => {
    setActionLoading(provider);
    try {
      const response = await fetch(`/api/connectors/${provider}/resume`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to resume sync");
      }

      toast.success(`${provider} sync resumed`);
      fetchConnectors();
    } catch (_error) {
      toast.error("Failed to resume sync");
    } finally {
      setActionLoading(null);
    }
  };

  const connectedCount = connectors.filter((c) => c.isConnected).length;
  const availableCount = connectors.filter((c) => c.isAvailable).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full hover:bg-input! p-2! data-[state=open]:bg-input!",
                className,
              )}
              disabled={disabled}
            >
              <ConnectorsIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span>Connectors</span>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        side="top"
        className="w-[22rem] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-0 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]"
      >
        {/* Background grid + glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage:
              "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 left-1/2 h-32 w-3/4 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{
            background: "radial-gradient(circle, #3d9e8c, transparent 70%)",
          }}
        />

        {/* Top hairline */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3d9e8c]/40 to-transparent"
        />

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full bg-[#3d9e8c] shadow-[0_0_6px_rgba(61,158,140,0.7)]"
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
              Connectors
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              {connectedCount} / {availableCount}
            </span>
            <button
              type="button"
              onClick={fetchConnectors}
              disabled={loading}
              className="group/refresh inline-flex size-6 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/45 transition-all hover:border-[#3d9e8c]/40 hover:bg-[#3d9e8c]/10 hover:text-[#3d9e8c] disabled:opacity-50"
              aria-label="Refresh connectors"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* ── List ────────────────────────────────────────────── */}
        <div className="relative max-h-[24rem] overflow-y-auto">
          {loading && connectors.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                <Loader2 className="size-3.5 animate-spin text-[#3d9e8c]" />
                Initializing
              </div>
            </div>
          ) : connectors.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
                No connectors available
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {connectors.map((connector, idx) => (
                <ConnectorRow
                  key={connector.provider}
                  connector={connector}
                  icon={PROVIDER_ICONS[connector.provider]}
                  isLoading={actionLoading === connector.provider}
                  index={idx}
                  onConnect={() => handleConnect(connector.provider)}
                  onDisconnect={() => handleDisconnect(connector.provider)}
                  onPause={() => handlePause(connector.provider)}
                  onResume={() => handleResume(connector.provider)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="relative flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/30">
            Flare · External sources
          </span>
          <a
            href="/settings/connectors"
            className="group/manage inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.3em] text-white/50 transition-colors hover:text-[#3d9e8c]"
          >
            Manage
            <ChevronRight className="size-2.5 transition-transform group-hover/manage:translate-x-0.5" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ConnectorRowProps {
  connector: ConnectorInfo;
  icon?: React.ReactNode;
  isLoading: boolean;
  index: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

function ConnectorRow({
  connector,
  icon,
  isLoading,
  index,
  onConnect,
  onDisconnect,
  onPause,
  onResume,
}: ConnectorRowProps) {
  const isAvailable = connector.isAvailable ?? false;
  const isConnected = connector.isConnected;
  const isPaused = connector.isPaused;

  // Status LED color
  const led = isConnected
    ? isPaused
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "bg-[#3d9e8c] shadow-[0_0_6px_rgba(61,158,140,0.7)]"
    : "bg-white/15";

  const statusText = !isAvailable
    ? "Soon"
    : isConnected
      ? isPaused
        ? "Paused"
        : "Online"
      : "Offline";

  return (
    <li
      className={cn(
        "group relative flex items-center gap-3.5 px-5 py-3.5 transition-colors",
        isAvailable && "hover:bg-white/[0.025]",
      )}
    >
      {/* Index gutter */}
      <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase tracking-[0.2em] text-white/15 group-hover:text-white/25">
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Icon tile */}
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-lg border transition-colors",
            isConnected
              ? isPaused
                ? "border-amber-400/25 bg-amber-400/[0.06]"
                : "border-[#3d9e8c]/30 bg-[#3d9e8c]/[0.08]"
              : "border-white/[0.08] bg-white/[0.02]",
          )}
        >
          {icon || <Mail className="size-5 text-white/40" />}
        </div>
        {/* LED */}
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 inline-block size-2 rounded-full ring-2 ring-[#0a0a0a]",
            led,
          )}
        />
      </div>

      {/* Center: name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-white/90">
            {connector.name}
          </span>
          {isConnected && !isPaused && (
            <Check className="size-3 shrink-0 text-[#3d9e8c]" />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          <span>{statusText}</span>
          {isConnected && connector.email ? (
            <>
              <span className="inline-block size-0.5 rounded-full bg-white/20" />
              <span className="truncate lowercase tracking-normal text-white/35">
                {connector.email}
              </span>
            </>
          ) : isConnected ? (
            <>
              <span className="inline-block size-0.5 rounded-full bg-white/20" />
              <span>Synced {formatLastSync(connector.lastSyncAt)}</span>
            </>
          ) : isAvailable ? (
            <>
              <span className="inline-block size-0.5 rounded-full bg-white/20" />
              <span className="truncate tracking-normal text-white/35">
                {connector.description}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Right: action */}
      <div className="shrink-0">
        {isLoading ? (
          <span className="inline-flex size-7 items-center justify-center">
            <Loader2 className="size-3.5 animate-spin text-[#3d9e8c]" />
          </span>
        ) : !isAvailable ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/25">
            Soon
          </span>
        ) : isConnected ? (
          <ConnectorActions
            isPaused={isPaused}
            onPause={onPause ?? (() => {})}
            onResume={onResume ?? (() => {})}
            onDisconnect={onDisconnect}
          />
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className={cn(
              "group/btn relative inline-flex h-7 items-center gap-1 overflow-hidden rounded-md px-2.5",
              "border border-[#3d9e8c]/30 bg-[#3d9e8c]/10 font-mono text-[10px] uppercase tracking-[0.2em] text-[#3d9e8c]",
              "transition-all hover:border-[#3d9e8c]/60 hover:bg-[#3d9e8c]/20 hover:text-[#5fc4ad]",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#3d9e8c]/20 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full"
            />
            <Plus className="size-3" />
            Connect
          </button>
        )}
      </div>
    </li>
  );
}

function ConnectorActions({
  isPaused,
  onPause,
  onResume,
  onDisconnect,
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={isPaused ? onResume : onPause}
        aria-label={isPaused ? "Resume sync" : "Pause sync"}
        className="inline-flex size-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
      >
        {isPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
      </button>
      <button
        type="button"
        onClick={onDisconnect}
        aria-label="Disconnect"
        className="inline-flex size-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-white/50 transition-all hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-300"
      >
        <Unlink className="size-3" />
      </button>
    </div>
  );
}
