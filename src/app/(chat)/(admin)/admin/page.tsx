"use client";

import { useState, useEffect } from "react";
import {
  UsersIcon, MessageSquareIcon, BotIcon,
  WrenchIcon, BoxIcon, SparklesIcon, Settings2Icon,
  ActivityIcon, ShieldIcon, RefreshCwIcon, TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

interface ProviderStats {
  name: string;
  calls: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number | null;
}

interface ModelStats {
  model: string;
  provider: string;
  calls: number;
  errors: number;
}

interface DashboardStats {
  totalUsers: number;
  activeThreads: number;
  totalThreads: number;
  providersTotal: number;
  modelCallsToday: number;
  providerStats: ProviderStats[];
  topModels: ModelStats[];
}

const TAB_LINKS = [
  { href: "/admin/settings/models", icon: <BotIcon className="size-5" />, label: "Models", desc: "Provider config" },
  { href: "/admin/settings/tools", icon: <WrenchIcon className="size-5" />, label: "Tools", desc: "Tool categories" },
  { href: "/admin/settings/canvas", icon: <BoxIcon className="size-5" />, label: "Canvas", desc: "Presentation config" },
  { href: "/admin/settings/artifacts", icon: <SparklesIcon className="size-5" />, label: "Artifacts", desc: "Artifact config" },
  { href: "/admin/settings/general", icon: <Settings2Icon className="size-5" />, label: "General", desc: "App settings" },
];

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="border rounded-xl bg-card p-5 flex items-center gap-4">
      <div className={cn("size-12 rounded-xl flex items-center justify-center shrink-0", color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ProviderHealthRow({ name, calls, errors, errorRate }: ProviderStats) {
  const total = calls + errors;
  const pct = total > 0 ? (calls / total) * 100 : 100;
  const hasErrors = errors > 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {hasErrors && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600">
              {errors} err{errors === 1 ? "or" : "ors"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{calls} call{calls !== 1 ? "s" : ""}</span>
          {errorRate > 0 && (
            <span className="text-red-500">{errorRate}% err</span>
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", hasErrors ? "bg-amber-500" : "bg-green-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ModelUsageRow({ model, provider, calls, errors }: ModelStats) {
  const maxCalls = 100; // normalize display
  const width = Math.min((calls / maxCalls) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs truncate max-w-[180px]" title={model}>{model}</span>
          <div className="flex items-center gap-2 shrink-0">
            {errors > 0 && (
              <span className="text-xs text-red-500">{errors} err</span>
            )}
            <span className="text-xs text-muted-foreground">{calls}</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500/70"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{provider}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeThreads: 0,
    totalThreads: 0,
    providersTotal: 0,
    modelCallsToday: 0,
    providerStats: [],
    topModels: [],
  });

  useEffect(() => {
    fetch("/api/admin/dashboard/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data.stats) {
          setStats({
            totalUsers: data.stats.totalUsers ?? 0,
            activeThreads: data.stats.activeThreads ?? 0,
            totalThreads: data.stats.totalThreads ?? 0,
            providersTotal: data.stats.providersTotal ?? 0,
            modelCallsToday: data.stats.modelCallsToday ?? 0,
            providerStats: data.stats.providerStats ?? [],
            topModels: data.stats.topModels ?? [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border rounded-xl bg-card p-5 h-24 animate-pulse bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ActivityIcon className="size-6 text-muted-foreground" />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your Flare AI deployment.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCwIcon className="size-4" />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={String(stats.totalUsers)}
          icon={<UsersIcon className="size-5 text-blue-600" />}
          color="bg-blue-500/10"
        />
        <StatCard
          label="Active Threads (24h)"
          value={String(stats.activeThreads)}
          icon={<MessageSquareIcon className="size-5 text-green-600" />}
          color="bg-green-500/10"
        />
        <StatCard
          label="Model Calls Today"
          value={String(stats.modelCallsToday)}
          icon={<TrendingUpIcon className="size-5 text-orange-600" />}
          color="bg-orange-500/10"
        />
        <StatCard
          label="Active Providers"
          value={String(stats.providersTotal)}
          icon={<BotIcon className="size-5 text-purple-600" />}
          color="bg-purple-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Health */}
        <div className="border rounded-xl bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ShieldIcon className="size-4 text-muted-foreground" />
              Provider Health (7d)
            </h2>
            <Link href="/admin/settings/models" className="text-xs text-primary hover:underline">
              Configure
            </Link>
          </div>
          {stats.providerStats.length > 0 ? (
            <div className="space-y-3">
              {stats.providerStats.map((p) => (
                <ProviderHealthRow key={p.name} {...p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No call data yet. Chat activity will appear here.
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Derived from message metadata — bars show success rate
          </p>
        </div>

        {/* Top Models */}
        <div className="border rounded-xl bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-muted-foreground" />
              Top Models (7d)
            </h2>
          </div>
          {stats.topModels.length > 0 ? (
            <div className="space-y-3">
              {stats.topModels.map((m, i) => (
                <ModelUsageRow key={`${m.model}-${i}`} {...m} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No model usage data yet.
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Top 10 models by call volume from the last 7 days
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Settings2Icon className="size-4 text-muted-foreground" />
          Quick Links
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TAB_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <span className="text-muted-foreground">{link.icon}</span>
              <div>
                <span className="text-sm font-medium block">{link.label}</span>
                <span className="text-xs text-muted-foreground">{link.desc}</span>
              </div>
            </Link>
          ))}
          <Link
            href="/admin/users"
            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <UsersIcon className="size-5 text-muted-foreground" />
            <div>
              <span className="text-sm font-medium block">User Management</span>
              <span className="text-xs text-muted-foreground">Manage users and roles</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}