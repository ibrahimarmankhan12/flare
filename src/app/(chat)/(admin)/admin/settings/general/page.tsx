"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2Icon,
  Loader2,
  CheckCircle2Icon,
  Globe,
  RotateCcw,
} from "lucide-react";
import { Button } from "ui/button";
import { Switch } from "ui/switch";
import { cn } from "lib/utils";
import {
  showSaveSuccess,
  showSaveError,
} from "@/components/admin/ui/toast-helpers";
import {
  ShortcutHelpModal,
  useAdminShortcuts,
} from "@/components/admin/ui/shortcut-help-modal";

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
}

interface GeneralConfig {
  appName?: string;
  appLogoUrl?: string;
  defaultToolChoice?: "auto" | "none" | "manual";
  freeTierDailyTokenLimit?: number;
  freeTierEnabled?: boolean;
  rateLimitPerUser?: number;
  rateLimitPerIP?: number;
  featureFlags?: Record<string, boolean>;
}

const FEATURE_FLAG_DEFS: FeatureFlag[] = [
  {
    key: "newCanvas",
    label: "New Canvas",
    description: "Enable the new canvas generation engine",
  },
  {
    key: "voiceChat",
    label: "Voice Chat",
    description: "Enable voice-based chat interface",
  },
  {
    key: "communityPage",
    label: "Community Page",
    description: "Show community page in navigation",
  },
  {
    key: "experimentalAgents",
    label: "Experimental Agents",
    description: "Enable experimental AI agent features",
  },
];

export default function GeneralPage() {
  const defaults: GeneralConfig = {
    appName: "Flare AI",
    appLogoUrl: "/flare-logo-512.webp",
    defaultToolChoice: "auto",
    freeTierDailyTokenLimit: 150000,
    freeTierEnabled: true,
    rateLimitPerUser: 60,
    rateLimitPerIP: 120,
    featureFlags: {
      newCanvas: true,
      voiceChat: true,
      communityPage: true,
      experimentalAgents: false,
    },
  };
  const [config, setConfig] = useState<GeneralConfig>(defaults);
  const [initialConfig, setInitialConfig] = useState<GeneralConfig>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { showHelp, setShowHelp } = useAdminShortcuts();

  useEffect(() => {
    setIsDirty(JSON.stringify(initialConfig) !== JSON.stringify(config));
  }, [config, initialConfig]);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.config?.general) {
          setConfig(d.config.general);
          setInitialConfig(d.config.general);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "general", settings: config }),
      });
      if (res.ok) {
        setInitialConfig(config);
        setSaved(true);
        showSaveSuccess("General settings saved");
        setTimeout(() => setSaved(false), 3000);
      } else {
        showSaveError();
      }
    } catch {
      showSaveError();
    } finally {
      setSaving(false);
    }
  }, [config]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="border rounded-xl bg-card p-5 space-y-4 max-w-2xl">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ShortcutHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Settings2Icon className="size-6 text-muted-foreground" />
              General
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              App-level configuration, branding, and rate limits.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-xs text-amber-600 flex items-center gap-1.5">
                Unsaved changes
              </span>
            )}
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                <CheckCircle2Icon className="size-4" />
                Saved
              </span>
            )}
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Reset to saved values? Any unsaved changes will be lost.",
                  )
                ) {
                  setConfig(initialConfig);
                }
              }}
              className="h-9 px-3 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
              title="Reset to saved values"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
            <Button
              onClick={handleSave}
              disabled={saving || !isDirty}
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <button
              onClick={() => setShowHelp(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Keyboard shortcuts"
            >
              ?
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          {/* Branding */}
          <div className="border rounded-xl bg-card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Globe className="size-4" />
              Branding
            </h2>

            <div>
              <label className="text-sm font-medium block mb-1.5">
                App Name
              </label>
              <input
                type="text"
                value={config.appName ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, appName: e.target.value }))
                }
                className="h-9 w-full px-3 text-sm rounded-md border bg-background"
                placeholder="Flare AI"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">
                Logo URL
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={config.appLogoUrl ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, appLogoUrl: e.target.value }))
                  }
                  className="h-9 flex-1 px-3 text-sm rounded-md border bg-background"
                  placeholder="/flare-logo-512.webp"
                />
                {config.appLogoUrl && (
                  <div className="h-9 w-9 rounded-md border overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={config.appLogoUrl}
                      alt="Logo preview"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tool Settings */}
          <div className="border rounded-xl bg-card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tool Behavior
            </h2>

            <div>
              <label className="text-sm font-medium block mb-2">
                Default Tool Choice
              </label>
              <div className="flex gap-2">
                {(["auto", "none", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() =>
                      setConfig((c) => ({ ...c, defaultToolChoice: mode }))
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm border transition-colors",
                      config.defaultToolChoice === mode
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Controls how tools are selected by default in new chats.
              </p>
            </div>
          </div>

          {/* Free Tier */}
          <div className="border rounded-xl bg-card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Free Tier
            </h2>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Enable Free Tier</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allow free users with token limits.
                </p>
              </div>
              <Switch
                checked={config.freeTierEnabled ?? true}
                onCheckedChange={(v) =>
                  setConfig((c) => ({ ...c, freeTierEnabled: v }))
                }
              />
            </div>

            {config.freeTierEnabled && (
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Daily Token Limit
                </label>
                <input
                  type="number"
                  value={config.freeTierDailyTokenLimit ?? 150000}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      freeTierDailyTokenLimit:
                        parseInt(e.target.value) || 150000,
                    }))
                  }
                  className="h-9 w-40 px-3 text-sm rounded-md border bg-background"
                  min={0}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tokens allowed per free user per day.
                </p>
              </div>
            )}
          </div>

          {/* Rate Limits */}
          <div className="border rounded-xl bg-card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Rate Limits
            </h2>

            <div>
              <label className="text-sm font-medium block mb-1.5">
                Per User (req/min)
              </label>
              <input
                type="number"
                value={config.rateLimitPerUser ?? 60}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    rateLimitPerUser: parseInt(e.target.value) || 60,
                  }))
                }
                className="h-9 w-32 px-3 text-sm rounded-md border bg-background"
                min={1}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">
                Per IP Address (req/min)
              </label>
              <input
                type="number"
                value={config.rateLimitPerIP ?? 120}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    rateLimitPerIP: parseInt(e.target.value) || 120,
                  }))
                }
                className="h-9 w-32 px-3 text-sm rounded-md border bg-background"
                min={1}
              />
            </div>
          </div>

          {/* Feature Flags */}
          <div className="border rounded-xl bg-card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Feature Flags
            </h2>

            {FEATURE_FLAG_DEFS.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{flag.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {flag.description}
                  </p>
                </div>
                <Switch
                  checked={config.featureFlags?.[flag.key] ?? false}
                  onCheckedChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      featureFlags: {
                        ...(c.featureFlags ?? {}),
                        [flag.key]: v,
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
