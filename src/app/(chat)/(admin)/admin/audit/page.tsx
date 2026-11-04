"use client";

import { useState, useEffect } from "react";
import { HistoryIcon } from "lucide-react";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  key: string;
  settings: Record<string, unknown>;
  changedBy: string;
  changedAt: string;
  changeType: "create" | "update" | "reset";
  userEmail: string | null;
}

const KEY_LABELS: Record<string, string> = {
  models: "Models",
  tools: "Tools",
  canvas: "Canvas",
  artifacts: "Artifacts",
  general: "General",
};

const CHANGE_TYPE_STYLES: Record<string, { badge: string; label: string }> = {
  create: { badge: "bg-green-500/10 text-green-600", label: "Create" },
  update: { badge: "bg-blue-500/10 text-blue-600", label: "Update" },
  reset: { badge: "bg-red-500/10 text-red-600", label: "Reset" },
};

function formatUserLabel(email: string | null, userId: string): string {
  return email ?? userId.slice(0, 8) + "...";
}

function settingsPreview(settings: Record<string, unknown>): string {
  const keys = Object.keys(settings).slice(0, 4);
  if (keys.length === 0) return "—";
  return keys.join(", ");
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKey, setFilterKey] = useState<string>("all");

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEntries(d.entries ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    filterKey === "all" ? entries : entries.filter((e) => e.key === filterKey);

  const keys = ["all", ...Object.keys(KEY_LABELS)];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <HistoryIcon className="size-6 text-muted-foreground" />
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          History of all site configuration changes.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() => setFilterKey(key)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              filterKey === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "all" ? "All" : KEY_LABELS[key] ?? key}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <HistoryIcon className="size-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No audit entries yet</p>
          <p className="text-xs mt-1">Configuration changes will appear here.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Section</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Change</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((entry) => {
                const style = CHANGE_TYPE_STYLES[entry.changeType] ?? CHANGE_TYPE_STYLES.update;
                return (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.changedAt), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground">{formatUserLabel(entry.userEmail, entry.changedBy)}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {KEY_LABELS[entry.key] ?? entry.key}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                      {settingsPreview(entry.settings)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}