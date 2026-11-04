"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BotIcon,
  Loader2,
  CheckCircle2Icon,
  XCircleIcon,
  AlertCircleIcon,
  RotateCcwIcon,
  RotateCcw,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Link2,
  Download,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "ui/switch";
import { Button } from "ui/button";
import {
  ModelSelector,
  FallbackChainSelector,
  FallbackChainValue,
} from "@/components/admin/ui/model-selector";
import {
  showSaveSuccess,
  showSaveError,
} from "@/components/admin/ui/toast-helpers";
import {
  ShortcutHelpModal,
  useAdminShortcuts,
} from "@/components/admin/ui/shortcut-help-modal";

interface ProviderInfo {
  enabled: boolean;
  defaultModel?: string;
  apiKeyConfigured: boolean;
  fallbackChain?: FallbackChainValue[];
  isDynamic?: boolean;
  baseURL?: string;
  models?: string[];
}

interface DynamicProviderConfig {
  name: string;
  baseURL: string;
  apiKeyConfigured: boolean;
  enabled: boolean;
  defaultModel?: string;
  fallbackChain?: FallbackChainValue[];
  models?: string[];
  addedAt?: string;
}

interface ModelsConfig {
  providers: Record<string, ProviderInfo>;
  globalFallback?: string;
  dynamicProviders?: Record<string, DynamicProviderConfig>;
}

interface ProviderStatus {
  provider: string;
  status: "live" | "failed" | "rate_limited" | "disabled" | "checking";
  latencyMs?: number;
  error?: string;
}

const PROVIDER_DISPLAY: Record<string, string> = {
  flare: "Flare",
  groq: "Groq",
  openai: "OpenAI",
  google: "Google Gemini",
  anthropic: "Anthropic",
  perplexity: "Perplexity",
  openrouter: "OpenRouter",
  xai: "xAI (Grok)",
  zai: "Z AI (GLM)",
  ollama: "Ollama",
  KonvO: "KonvO",
  Deepseek: "Deepseek",
  Moonshot: "Moonshot",
  MiniMax: "MiniMax",
  Nvidia: "Nvidia",
  Qwen: "Qwen",
};

function StatusBadge({
  status,
  latencyMs,
  error,
}: { status: ProviderStatus["status"]; latencyMs?: number; error?: string }) {
  switch (status) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
          <span className="size-1.5 rounded-full bg-green-500" />{" "}
          {latencyMs != null ? `${latencyMs}ms` : "Connected"}
        </span>
      );
    case "failed":
      return (
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600"
          title={error}
        >
          <XCircleIcon className="size-3" />{" "}
          {error ? `Failed: ${error}` : "Failed"}
        </span>
      );
    case "rate_limited":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
          <AlertCircleIcon className="size-3" /> Rate Limited
        </span>
      );
    case "checking":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Checking
        </span>
      );
    case "disabled":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Disabled
        </span>
      );
    default:
      return null;
  }
}

function getStaticProviders(providers: Record<string, ProviderInfo>) {
  return Object.entries(providers).filter(([, info]) => !info.isDynamic);
}

function getDynamicProviderEntries(
  providers: Record<string, ProviderInfo>,
  dynamicProviders?: Record<string, DynamicProviderConfig>,
) {
  return Object.entries(providers)
    .filter(([, info]) => info.isDynamic)
    .map(([key, info]) => ({
      key,
      info,
      meta: dynamicProviders?.[key],
    }));
}

function buildDefaultModelsConfig(): ModelsConfig {
  return {
    providers: {
      flare: {
        enabled: true,
        apiKeyConfigured: true,
        defaultModel: "Claude Opus 4.6",
        fallbackChain: [{ provider: "flare", model: "Gemini 3 Flash" }],
      },
      groq: {
        enabled: true,
        apiKeyConfigured: true,
        defaultModel: "Llama 4 17b Scout",
        fallbackChain: [{ provider: "flare", model: "Gemini 3 Flash" }],
      },
      openai: {
        enabled: true,
        apiKeyConfigured: false,
        defaultModel: "GPT 5.5",
        fallbackChain: [{ provider: "flare", model: "Gemini 3 Flash" }],
      },
      google: {
        enabled: true,
        apiKeyConfigured: false,
        defaultModel: "Gemini 3 Flash",
        fallbackChain: [{ provider: "flare", model: "Gemini 3 Flash" }],
      },
      anthropic: {
        enabled: true,
        apiKeyConfigured: false,
        defaultModel: "Claude Opus 4.6",
        fallbackChain: [{ provider: "flare", model: "Gemini 3 Flash" }],
      },
      perplexity: {
        enabled: true,
        apiKeyConfigured: false,
        defaultModel: "Sonar",
        fallbackChain: [{ provider: "flare", model: "Gemini 3 Flash" }],
      },
      openrouter: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      xai: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      zai: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      ollama: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      konvo: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      deepseek: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      moonshot: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      minimax: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
      nvidia: {
        enabled: false,
        apiKeyConfigured: true,
        defaultModel: "",
        fallbackChain: [],
      },
      qwen: {
        enabled: false,
        apiKeyConfigured: false,
        defaultModel: "",
        fallbackChain: [],
      },
    },
  };
}

export default function ModelsPage() {
  const [config, setConfig] = useState<ModelsConfig>({ providers: {} });
  const [initialConfig, setInitialConfig] = useState<ModelsConfig>({
    providers: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [isDirty, setIsDirty] = useState(false);
  const { showHelp, setShowHelp } = useAdminShortcuts();

  // Dynamic provider modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: "",
    baseURL: "",
    apiKey: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);

  // Track dirty state
  useEffect(() => {
    setIsDirty(JSON.stringify(initialConfig) !== JSON.stringify(config));
  }, [config, initialConfig]);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.config?.models) {
          const m = d.config.models;
          setConfig(m);
          setInitialConfig(m);
          const init: Record<string, ProviderStatus> = {};
          for (const [p, info] of Object.entries(m.providers ?? {}) as [
            string,
            ProviderInfo,
          ][]) {
            init[p] = {
              provider: p,
              status: info.enabled ? "checking" : "disabled",
            };
          }
          setStatuses(init);
        } else {
          console.warn(
            "[models] config fetch failed:",
            d.error,
            ". Using default config.",
          );
          // Fall back to default config so the UI is usable even if DB fetch fails
          const defaultConfig = buildDefaultModelsConfig();
          setConfig(defaultConfig);
          setInitialConfig(defaultConfig);
          const init: Record<string, ProviderStatus> = {};
          for (const [p, info] of Object.entries(defaultConfig.providers) as [
            string,
            ProviderInfo,
          ][]) {
            init[p] = {
              provider: p,
              status: info.enabled ? "checking" : "disabled",
            };
          }
          setStatuses(init);
        }
      })
      .catch((err) => {
        console.error("[models] config fetch error:", err);
        // On network error, still show default config so UI is usable
        const defaultConfig = buildDefaultModelsConfig();
        setConfig(defaultConfig);
        setInitialConfig(defaultConfig);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fire parallel health checks for all enabled providers on initial load.
  // Guarded by configLoadedRef so it only runs once (not on config changes).
  const configLoadedRef = useRef(false);
  useEffect(() => {
    if (configLoadedRef.current) return;
    const enabledProviders = Object.entries(config.providers ?? {})
      .filter(([, info]) => info.enabled)
      .map(([p]) => p);
    if (enabledProviders.length === 0) return;
    configLoadedRef.current = true;

    Promise.allSettled(
      enabledProviders.map((provider) =>
        fetch("/api/admin/providers/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        }).then((r) => r.json()),
      ),
    ).then((results) => {
      enabledProviders.forEach((provider, i) => {
        const result = results[i];
        if (result.status === "rejected") {
          setStatuses((prev) => ({
            ...prev,
            [provider]: { provider, status: "failed", error: "Request failed" },
          }));
        } else {
          const data = result.value as {
            success: boolean;
            latencyMs: number;
            error?: string;
          };
          setStatuses((prev) => ({
            ...prev,
            [provider]: {
              provider,
              status: data.success ? "live" : "failed",
              latencyMs: data.latencyMs,
              error: data.error,
            },
          }));
        }
      });
    });
  }, [config]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "models",
          settings: config,
        }),
      });
      const responseData = await res.json();
      if (res.ok) {
        setSaved(true);
        setInitialConfig(config);
        showSaveSuccess("Model configuration saved");
        setTimeout(() => setSaved(false), 3000);
      } else {
        showSaveError(
          responseData.error ?? "Failed to save model configuration",
        );
      }
    } catch (err) {
      console.error("[models] save error:", err);
      showSaveError("Failed to save model configuration");
    } finally {
      setSaving(false);
    }
  }, [config]);

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const testConnection = async (provider: string) => {
    setStatuses((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], status: "checking" },
    }));
    try {
      const res = await fetch("/api/admin/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setStatuses((prev) => ({
        ...prev,
        [provider]: {
          provider,
          status: data.success ? "live" : "failed",
          latencyMs: data.latencyMs,
          error: data.error,
        },
      }));
      if (data.success) {
        toast.success(
          `${PROVIDER_DISPLAY[provider] ?? provider} connection successful (${data.latencyMs}ms)`,
        );
      } else {
        toast.error(
          `${PROVIDER_DISPLAY[provider] ?? provider} connection failed: ${data.error}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setStatuses((prev) => ({
        ...prev,
        [provider]: { provider, status: "failed", error: msg },
      }));
      toast.error(
        `${PROVIDER_DISPLAY[provider] ?? provider} connection failed: ${msg}`,
      );
    }
  };

  const toggleProvider = (provider: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          enabled: !prev.providers[provider]?.enabled,
        },
      },
    }));
  };

  const updateProviderModel = (
    provider: string,
    field: "defaultModel" | "fallbackChain",
    value: string | FallbackChainValue[],
  ) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          [field]: value,
        },
      },
    }));
  };

  const handleDiscoverModels = async () => {
    if (!newProvider.baseURL) {
      toast.error("Base URL is required to discover models");
      return;
    }
    setDiscovering(true);
    setDiscoveredModels([]);
    try {
      const params = new URLSearchParams({ baseURL: newProvider.baseURL });
      if (newProvider.apiKey) params.set("apiKey", newProvider.apiKey);
      const res = await fetch(`/api/admin/providers/discover?${params}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.models)) {
        setDiscoveredModels(data.models);
        if (data.models.length === 0) {
          toast.info("No models discovered from this endpoint");
        } else {
          toast.success(`Discovered ${data.models.length} model(s)`);
        }
      } else {
        toast.error(data.error ?? "Failed to discover models");
      }
    } catch {
      toast.error("Failed to discover models");
    } finally {
      setDiscovering(false);
    }
  };

  const handleSaveProvider = async () => {
    if (!newProvider.name.trim() || !newProvider.baseURL.trim()) {
      toast.error("Provider name and Base URL are required");
      return;
    }
    setSavingProvider(true);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProvider.name.trim(),
          baseURL: newProvider.baseURL.trim(),
          apiKey: newProvider.apiKey,
          models: discoveredModels,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const id = data.id as string;
        setConfig((prev) => ({
          ...prev,
          dynamicProviders: {
            ...(prev.dynamicProviders ?? {}),
            [id]: {
              name: newProvider.name.trim(),
              baseURL: newProvider.baseURL.trim(),
              apiKeyConfigured: !!newProvider.apiKey,
              enabled: true,
              models: discoveredModels.length > 0 ? discoveredModels : [],
              addedAt: new Date().toISOString(),
            },
          },
          providers: {
            ...prev.providers,
            [id]: {
              enabled: true,
              apiKeyConfigured: !!newProvider.apiKey,
              defaultModel: "",
              fallbackChain: [],
              isDynamic: true,
              baseURL: newProvider.baseURL.trim(),
              models: discoveredModels.length > 0 ? discoveredModels : [],
            },
          },
        }));
        showSaveSuccess(`${newProvider.name} added successfully`);
        setShowAddModal(false);
        setNewProvider({ name: "", baseURL: "", apiKey: "" });
        setDiscoveredModels([]);
        setShowApiKey(false);
      } else {
        showSaveError(data.error ?? "Failed to add provider");
      }
    } catch {
      showSaveError("Failed to add provider");
    } finally {
      setSavingProvider(false);
    }
  };

  const handleRemoveProvider = (id: string) => {
    if (!window.confirm("Remove this provider? This cannot be undone.")) return;
    setConfig((prev) => {
      const providers = { ...prev.providers };
      delete providers[id];
      const dynamicProviders = { ...(prev.dynamicProviders ?? {}) };
      delete dynamicProviders[id];
      return { ...prev, providers, dynamicProviders };
    });
    toast.success("Provider removed");
  };

  const toggleDynamicProvider = (id: string) => {
    setConfig((prev) => {
      const existing = prev.dynamicProviders?.[id];
      return {
        ...prev,
        dynamicProviders: {
          ...(prev.dynamicProviders ?? {}),
          [id]: {
            name: existing?.name ?? id,
            baseURL: existing?.baseURL ?? "",
            apiKeyConfigured: existing?.apiKeyConfigured ?? false,
            enabled: !(existing?.enabled ?? true),
            defaultModel: existing?.defaultModel,
            fallbackChain: existing?.fallbackChain,
            models: existing?.models,
            addedAt: existing?.addedAt,
          },
        },
      };
    });
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/config?action=export");
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Export failed");
        return;
      }
      const blob = new Blob([JSON.stringify(data.config, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `flare-config-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Configuration exported successfully");
    } catch {
      toast.error("Export failed");
    }
  };

  const triggerImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      let parsed: unknown;
      try {
        const text = await file.text();
        parsed = JSON.parse(text);
      } catch {
        toast.error("Invalid JSON file");
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        toast.error("Invalid config file");
        return;
      }
      setImporting(true);
      try {
        const res = await fetch("/api/admin/config?action=import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: parsed }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          toast.success(`Imported ${data.imported} section(s) successfully`);
          window.location.reload();
        } else {
          toast.error(data.error ?? "Import failed");
        }
      } catch {
        toast.error("Import failed");
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const staticProviders = getStaticProviders(config.providers ?? {});
  const dynamicProviderEntries = getDynamicProviderEntries(
    config.providers ?? {},
    config.dynamicProviders,
  );

  const enabledStatic = staticProviders.filter(([, v]) => v.enabled);
  const disabledStatic = staticProviders.filter(([, v]) => !v.enabled);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-xl bg-card p-5 space-y-3">
              <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="space-y-2">
                {[1, 2].map((j) => (
                  <div
                    key={j}
                    className="h-10 animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ShortcutHelpModal open={showHelp} onClose={() => setShowHelp(false)} />

      {/* Add Dynamic Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Custom Provider</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewProvider({ name: "", baseURL: "", apiKey: "" });
                  setDiscoveredModels([]);
                  setShowApiKey(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={newProvider.name}
                  onChange={(e) =>
                    setNewProvider((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. my-llm-service"
                  className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Base URL
                </label>
                <input
                  type="url"
                  value={newProvider.baseURL}
                  onChange={(e) =>
                    setNewProvider((p) => ({ ...p, baseURL: e.target.value }))
                  }
                  placeholder="https://api.example.com/v1"
                  className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  API Key
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    (optional)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={newProvider.apiKey}
                    onChange={(e) =>
                      setNewProvider((p) => ({ ...p, apiKey: e.target.value }))
                    }
                    placeholder="sk-..."
                    className="w-full h-9 px-3 pr-10 rounded-md border bg-background text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscoverModels}
                disabled={discovering || !newProvider.baseURL}
              >
                {discovering ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Discovering...
                  </>
                ) : (
                  <>
                    <Link2 className="size-3.5 mr-1.5" />
                    Discover Models
                  </>
                )}
              </Button>
              {discoveredModels.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {discoveredModels.length} model(s) found
                </span>
              )}
            </div>

            {discoveredModels.length > 0 && (
              <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                {discoveredModels.map((model) => (
                  <div
                    key={model}
                    className="text-xs px-2 py-1 rounded hover:bg-muted"
                  >
                    {model}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddModal(false);
                  setNewProvider({ name: "", baseURL: "", apiKey: "" });
                  setDiscoveredModels([]);
                  setShowApiKey(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveProvider}
                disabled={
                  savingProvider ||
                  !newProvider.name.trim() ||
                  !newProvider.baseURL.trim()
                }
              >
                {savingProvider ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="size-4 mr-1.5" />
                    Add Provider
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BotIcon className="size-6 text-muted-foreground" />
              Model Providers
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure AI providers, default models, and fallbacks.
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
              onClick={handleExport}
              className="h-9 px-3 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
              title="Export configuration"
            >
              <Download className="size-3.5" />
              Export
            </button>
            <button
              onClick={triggerImport}
              disabled={importing}
              className="h-9 px-3 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground disabled:opacity-50"
              title="Import configuration"
            >
              {importing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Import
            </button>
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

        {/* Global Fallback */}
        {config.globalFallback && (
          <div className="mb-6 p-4 border rounded-xl bg-card">
            <h3 className="text-sm font-medium mb-2">Global Fallback Model</h3>
            <p className="text-xs text-muted-foreground">
              {config.globalFallback}
            </p>
          </div>
        )}

        {/* Dynamic Providers Section */}
        {dynamicProviderEntries.length > 0 && (
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Custom Providers ({dynamicProviderEntries.length})
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="size-3.5 mr-1.5" />
                Add Provider
              </Button>
            </div>
            {dynamicProviderEntries.map(({ key, info, meta }) => {
              const status = statuses[key];
              return (
                <div
                  key={key}
                  className="border border-blue-200 dark:border-blue-800/50 rounded-xl bg-card p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-base">
                        {meta?.name ?? key}
                      </span>
                      {status && (
                        <StatusBadge
                          status={status.status}
                          latencyMs={status.latencyMs}
                          error={status.error}
                        />
                      )}
                      <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                        Custom
                      </span>
                      {info.baseURL && (
                        <span
                          className="text-xs text-muted-foreground truncate max-w-[200px]"
                          title={info.baseURL}
                        >
                          {info.baseURL}
                        </span>
                      )}
                      {info.apiKeyConfigured ? (
                        <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded">
                          API Key Set
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded">
                          No API Key
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(key)}
                        disabled={status?.status === "checking"}
                      >
                        {status?.status === "checking" ? (
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                        ) : (
                          <RotateCcwIcon className="size-3.5 mr-1.5" />
                        )}
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => handleRemoveProvider(key)}
                      >
                        <Trash2 className="size-3.5 mr-1.5" />
                        Remove
                      </Button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Enabled
                        </span>
                        <Switch
                          checked={info.enabled}
                          onCheckedChange={() => toggleDynamicProvider(key)}
                        />
                      </div>
                    </div>
                  </div>

                  {info.enabled && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <ModelSelector
                        label="Default Model"
                        providerId={key}
                        value={info.defaultModel ?? ""}
                        onChange={(v) =>
                          updateProviderModel(key, "defaultModel", v)
                        }
                      />
                      <FallbackChainSelector
                        label="Fallback Chain"
                        value={info.fallbackChain ?? []}
                        onChange={(v) =>
                          updateProviderModel(key, "fallbackChain", v)
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add Custom Provider (shown when no dynamic providers exist yet) */}
        {dynamicProviderEntries.length === 0 && (
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="size-3.5 mr-1.5" />
              Add Custom Provider
            </Button>
          </div>
        )}

        {/* Enabled Static (Built-in) Providers */}
        <div className="space-y-4 mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Built-in Providers ({enabledStatic.length})
          </h2>
          {enabledStatic.map(([provider, info]) => {
            const status = statuses[provider];
            return (
              <div
                key={provider}
                className="border rounded-xl bg-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-base">
                      {PROVIDER_DISPLAY[provider] ?? provider}
                    </span>
                    {status && (
                      <StatusBadge
                        status={status.status}
                        latencyMs={status.latencyMs}
                        error={status.error}
                      />
                    )}
                    {info.apiKeyConfigured ? (
                      <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded">
                        API Key Set
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded">
                        No API Key
                      </span>
                    )}
                    {status?.latencyMs && (
                      <span className="text-xs text-muted-foreground">
                        {status.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(provider)}
                      disabled={status?.status === "checking"}
                    >
                      {status?.status === "checking" ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RotateCcwIcon className="size-3.5 mr-1.5" />
                      )}
                      Test
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Enabled
                      </span>
                      <Switch
                        checked={info.enabled}
                        onCheckedChange={() => toggleProvider(provider)}
                      />
                    </div>
                  </div>
                </div>

                {info.enabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <ModelSelector
                      label="Default Model"
                      providerId={provider}
                      value={info.defaultModel ?? ""}
                      onChange={(v) =>
                        updateProviderModel(provider, "defaultModel", v)
                      }
                    />
                    <FallbackChainSelector
                      label="Fallback Chain"
                      value={info.fallbackChain ?? []}
                      onChange={(v) =>
                        updateProviderModel(provider, "fallbackChain", v)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Disabled Static Providers */}
        {disabledStatic.length > 0 && (
          <div className="space-y-4 opacity-60">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Disabled Providers ({disabledStatic.length})
            </h2>
            {disabledStatic.map(([provider, info]) => (
              <div
                key={provider}
                className="border border-dashed rounded-xl bg-card p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm text-muted-foreground">
                    {PROVIDER_DISPLAY[provider] ?? provider}
                  </span>
                  {!info.apiKeyConfigured && (
                    <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded">
                      No API Key
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Disabled
                  </span>
                  <Switch
                    checked={false}
                    onCheckedChange={() => toggleProvider(provider)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
