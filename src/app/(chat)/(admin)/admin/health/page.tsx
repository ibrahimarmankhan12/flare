"use client";

import { useState, useEffect } from "react";
import {
  ShieldIcon, DatabaseIcon, ServerIcon,
  CheckCircle2Icon, Loader2,
  RefreshCwIcon, ClockIcon,
} from "lucide-react";
import { cn } from "lib/utils";

interface ProviderHealth {
  name: string;
  status: "ok" | "error" | "rate_limited" | "disabled" | "no_key";
  latencyMs?: number;
  error?: string;
}

interface HealthCheck {
  db: { status: "ok" | "error"; latencyMs?: number };
  redis: { status: "ok" | "disabled" | "error"; latencyMs?: number };
  providers: ProviderHealth[];
  checkedAt?: string;
}

const PROVIDER_DISPLAY: Record<string, string> = {
  flare: "Flare", groq: "Groq", openai: "OpenAI",
  google: "Google Gemini", anthropic: "Anthropic",
  openrouter: "OpenRouter", xai: "xAI (Grok)",
  "z-ai": "Z AI (GLM)", ollama: "Ollama",
};

function StatusRow({
  label, icon, status, latencyMs, description,
}: {
  label: string;
  icon: React.ReactNode;
  status: "ok" | "error" | "disabled" | "rate_limited" | "unknown" | "failed" | "no_key";
  latencyMs?: number;
  description?: string;
}) {
  const ok = status === "ok" || status === "disabled";
  const noKey = status === "no_key";
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
      <div className="flex items-center gap-3">
        <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0",
          ok ? "bg-green-500/10 text-green-600" : noKey ? "bg-yellow-500/10 text-yellow-600" : "bg-red-500/10 text-red-600",
        )}>
          {icon}
        </div>
        <div>
          <span className="text-sm font-medium">{label}</span>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {latencyMs !== undefined && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3" /> {latencyMs}ms
          </span>
        )}
        <span className={cn(
          "text-xs px-2.5 py-1 rounded-full font-medium",
          ok
            ? "bg-green-500/10 text-green-600"
            : noKey
              ? "bg-yellow-500/10 text-yellow-600"
              : "bg-red-500/10 text-red-600",
        )}>
          {status === "ok" ? "OK" : status === "disabled" ? "Disabled" : status === "rate_limited" ? "Rate Limited" : status === "no_key" ? "No API Key" : "Error"}
        </span>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);

  const handleRecheck = () => {
    setRechecking(true);
    setLoading(false);
    fetch("/api/admin/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.health) {
          const enriched = {
            ...data.health,
            providers: data.health.providers.map((p: ProviderHealth) => ({
              ...p,
              name: PROVIDER_DISPLAY[p.name] ?? p.name,
            })),
          };
          setHealth(enriched);
        } else {
          throw new Error(data.error);
        }
      })
      .catch(() => {})
      .finally(() => setRechecking(false));
  };

  useEffect(() => {
    handleRecheck();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldIcon className="size-6 text-muted-foreground" />
            Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            System status and provider connectivity checks.
            {health?.checkedAt && <span className="ml-2">Last checked: {health.checkedAt}</span>}
          </p>
        </div>
        <button
          onClick={handleRecheck}
          disabled={rechecking}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors disabled:opacity-50"
        >
          {rechecking ? (
            <><Loader2 className="size-4 animate-spin" />Checking...</>
          ) : (
            <><RefreshCwIcon className="size-4" />Recheck</>
          )}
        </button>
      </div>

      {/* Core Systems */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Core Systems</h2>
        <StatusRow
          label="Database (PostgreSQL)"
          icon={<DatabaseIcon className="size-5" />}
          status={health?.db.status ?? "error"}
          latencyMs={health?.db.latencyMs}
          description="Primary data store"
        />
        <StatusRow
          label="Cache (Redis)"
          icon={<ServerIcon className="size-5" />}
          status={health?.redis.status ?? "disabled"}
          latencyMs={health?.redis.latencyMs}
          description={health?.redis.status === "disabled" ? "Not configured — using MemoryCache" : "Redis cache layer"}
        />
      </div>

      {/* AI Providers */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">AI Providers</h2>
        {health?.providers.map((p) => (
          <StatusRow
            key={p.name}
            label={p.name}
            icon={<CheckCircle2Icon className="size-5" />}
            status={p.status}
            latencyMs={p.latencyMs}
            description={p.error}
          />
        ))}
      </div>
    </div>
  );
}