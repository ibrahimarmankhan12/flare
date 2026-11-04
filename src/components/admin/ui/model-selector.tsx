"use client";

import { ChevronDown, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "lib/utils";

const EMPTY_METADATA: ModelMetadata = {
  isToolCallUnsupported: false,
  isImageInputUnsupported: false,
  isBlackboxModel: false,
};

export interface ModelMetadata {
  isToolCallUnsupported: boolean;
  isImageInputUnsupported: boolean;
  isBlackboxModel: boolean;
}

export interface ProviderOption {
  id: string;
  name: string;
  models: Array<{ name: string; metadata: ModelMetadata }>;
}

interface ModelSelectorProps {
  /** Current model display name (UI name, e.g. "Claude Opus 4.6") */
  value?: string;
  /** Pre-select this provider and only show its models */
  providerId?: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const STATIC_PROVIDERS: ProviderOption[] = [
  {
    id: "flare",
    name: "Flare X",
    models: ["Claude Opus 4.8", "Claude Opus 4.6", "Cursorlm"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
  {
    id: "groq",
    name: "Groq",
    models: [
      "Llama 3.3 70b Versatile",
      "Llama 4 17b Scout",
      "Llama 3.1 8b Instant",
      "Groq Compound",
      "Groq Compound Mini",
    ].map((n) => ({ name: n, metadata: EMPTY_METADATA })),
  },
  {
    id: "openai",
    name: "OpenAI",
    models: ["GPT 5.5", "GPT 5.4"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
  {
    id: "google",
    name: "Google Gemini",
    models: [
      "Gemini 3 Flash",
      "Gemini 3.1 Pro",
      "Gemma 4 31B",
      "Gemma 4 26B",
    ].map((n) => ({ name: n, metadata: EMPTY_METADATA })),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: ["Claude Opus 4.7", "Claude Opus 4.6", "Claude Opus 4.5"].map(
      (n) => ({ name: n, metadata: EMPTY_METADATA }),
    ),
  },
  {
    id: "perplexity",
    name: "Perplexity",
    models: ["Sonar"].map((n) => ({ name: n, metadata: EMPTY_METADATA })),
  },
  { id: "openrouter", name: "OpenRouter", models: [] },
  { id: "xai", name: "xAI (Grok)", models: [] },
  {
    id: "zai",
    name: "Z AI (GLM)",
    models: ["GLM 5.1", "GLM 5", "GLM 4.7"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
  { id: "ollama", name: "Ollama", models: [] },
  {
    id: "konvo",
    name: "KonvO",
    models: ["KonvO M", "KonvO 105b", "KonvO 30b"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
  {
    id: "deepseek",
    name: "Deepseek",
    models: [
      "Deepseek V4 Pro",
      "Deepseek V4 Flash",
      "Deepseek V3.2",
      "Deepseek V3.1",
    ].map((n) => ({ name: n, metadata: EMPTY_METADATA })),
  },
  {
    id: "moonshot",
    name: "Moonshot",
    models: ["Kimi K2.6", "Kimi K2.5", "Kimi K2 Thinking"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
  {
    id: "minimax",
    name: "MiniMax",
    models: ["MiniMax M 2.7", "MiniMax M 2.5", "MiniMax M 2.1"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
  {
    id: "nvidia",
    name: "Nvidia",
    models: ["Nemotron 3 Super", "Nemotron 3 Omni", "Nemotron 3 Nano Omni"].map(
      (n) => ({ name: n, metadata: EMPTY_METADATA }),
    ),
  },
  {
    id: "qwen",
    name: "Qwen",
    models: ["Qwen 3 32B", "Qwen 3.6 Plus"].map((n) => ({
      name: n,
      metadata: EMPTY_METADATA,
    })),
  },
];

interface ApiModelsResponse {
  modelsInfo?: Array<{
    provider: string;
    models: Array<{
      name: string;
      isToolCallUnsupported?: boolean;
      isImageInputUnsupported?: boolean;
      isBlackboxModel?: boolean;
    }>;
    hasAPIKey?: boolean;
  }>;
}

interface DynamicProvider {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  apiKeyConfigured: boolean;
  enabled: boolean;
}

interface AdminConfigResponse {
  success: boolean;
  config?: {
    models?: {
      providers?: Record<string, { enabled?: boolean }>;
      dynamicProviders?: Record<string, { enabled?: boolean }>;
    };
  };
}

/** Format a model name with short capability badges for <option> display. */
function formatModelOption(name: string, meta: ModelMetadata): string {
  const badges: string[] = [];
  if (meta.isBlackboxModel) {
    badges.push("[B]");
  } else {
    // Tools badge: [T] supported, [!T] not supported
    badges.push(meta.isToolCallUnsupported ? "[!T]" : "[T]");
    // Vision badge: [V] supported, [!V] not supported
    badges.push(meta.isImageInputUnsupported ? "[!V]" : "[V]");
  }
  return `${name} ${badges.join(" ")}`;
}

function transformApiResponse(data: ApiModelsResponse): ProviderOption[] {
  const raw = Array.isArray(data) ? data : data.modelsInfo;
  if (Array.isArray(raw)) {
    return raw.map((p: any) => ({
      id: p.provider.toLowerCase().replace(/\s+/g, "-"),
      name: p.provider,
      models: p.models.map((m: any) => ({
        name: m.name,
        metadata: {
          isToolCallUnsupported: m.isToolCallUnsupported ?? false,
          isImageInputUnsupported: m.isImageInputUnsupported ?? false,
          isBlackboxModel: m.isBlackboxModel ?? false,
        },
      })),
    }));
  }
  return STATIC_PROVIDERS;
}

function mergeDynamicProviders(
  staticProviders: ProviderOption[],
  dynamicProviders: DynamicProvider[],
): ProviderOption[] {
  const merged = [...staticProviders];
  for (const dp of dynamicProviders) {
    if (!dp.enabled || dp.models.length === 0) continue;
    const existing = merged.find((p) => p.id === dp.id);
    if (existing) {
      const existingSet = new Set(existing.models.map((m) => m.name));
      for (const m of dp.models) {
        if (!existingSet.has(m))
          existing.models.push({ name: m, metadata: EMPTY_METADATA });
      }
    } else {
      merged.push({
        id: dp.id,
        name: dp.name,
        models: dp.models.map((m) => ({ name: m, metadata: EMPTY_METADATA })),
      });
    }
  }
  return merged;
}

function filterDisabledProviders(
  providers: ProviderOption[],
  disabledSet: Set<string>,
  dynamicEnabled: Map<string, boolean>,
): ProviderOption[] {
  return providers.map((p) => {
    const isDynamic = dynamicEnabled.has(p.id);
    const isEnabled = isDynamic
      ? (dynamicEnabled.get(p.id) ?? false)
      : !disabledSet.has(p.id);
    if (isEnabled) return p;
    return { ...p, models: [] };
  });
}

function isProviderEnabled(
  providerId: string,
  disabledSet: Set<string>,
  dynamicEnabled: Map<string, boolean>,
): boolean {
  if (dynamicEnabled.has(providerId))
    return dynamicEnabled.get(providerId) ?? false;
  return !disabledSet.has(providerId);
}

export function ModelSelector({
  value,
  providerId,
  onChange,
  disabled,
  label,
  className,
}: ModelSelectorProps) {
  const [allProviders, setAllProviders] =
    useState<ProviderOption[]>(STATIC_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      const results = await Promise.allSettled([
        fetch("/api/chat/models"),
        fetch("/api/admin/providers"),
        fetch("/api/admin/config"),
      ]);
      if (cancelled) return;

      let data: ApiModelsResponse = {};
      let dynamicProviders: DynamicProvider[] = [];
      const disabledSet = new Set<string>();
      const dynamicEnabled = new Map<string, boolean>();

      // models response
      if (results[0].status === "fulfilled" && results[0].value.ok) {
        try {
          data = (await (
            results[0].value as Response
          ).json()) as ApiModelsResponse;
        } catch {
          /* ignore */
        }
      }

      // providers response
      if (results[1].status === "fulfilled" && results[1].value.ok) {
        try {
          const dpData = await (results[1].value as Response).json();
          if (dpData.success && Array.isArray(dpData.providers))
            dynamicProviders = dpData.providers;
        } catch {
          /* ignore */
        }
      }

      // admin config response
      if (results[2].status === "fulfilled" && results[2].value.ok) {
        try {
          const adminData: AdminConfigResponse = await (
            results[2].value as Response
          ).json();
          const modelsCfg = adminData.config?.models;
          if (modelsCfg?.providers) {
            for (const [p, info] of Object.entries(modelsCfg.providers)) {
              // Normalize key to lowercase for case-insensitive matching with provider IDs
              if (!info.enabled) disabledSet.add(p.toLowerCase());
            }
          }
          if (modelsCfg?.dynamicProviders) {
            for (const [p, info] of Object.entries(
              modelsCfg.dynamicProviders,
            )) {
              dynamicEnabled.set(p.toLowerCase(), info.enabled ?? false);
            }
          }
        } catch {
          /* ignore */
        }
      }

      const merged = mergeDynamicProviders(
        transformApiResponse(data),
        dynamicProviders,
      );
      setAllProviders(
        filterDisabledProviders(merged, disabledSet, dynamicEnabled),
      );
      setApiError(false);
      setLoading(false);
    }
    fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // If providerId is set, only show that provider's models
  const providers = providerId
    ? allProviders.filter((p) => p.id === providerId)
    : allProviders;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-muted-foreground block mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          disabled={disabled || loading || providers.length === 0}
          className="w-full h-9 px-3 pr-8 text-sm rounded-md border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="">
            {loading
              ? "Loading..."
              : apiError
                ? "could not reach"
                : "Select model"}
          </option>
          {providers.map((p) =>
            p.models.map((m) => (
              <option key={`${p.id}-${m.name}`} value={m.name}>
                {formatModelOption(m.name, m.metadata)}
              </option>
            )),
          )}
        </select>
        {loading ? (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin pointer-events-none" />
        ) : (
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        )}
      </div>
    </div>
  );
}

interface SimpleModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  providerId?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}

interface FallbackModelSelectorProps {
  value: { provider: string; model: string };
  onChange: (value: { provider: string; model: string }) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function FallbackModelSelector({
  value,
  onChange,
  disabled,
  label,
  className,
}: FallbackModelSelectorProps) {
  const [allProviders, setAllProviders] =
    useState<ProviderOption[]>(STATIC_PROVIDERS);
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());
  const [dynamicEnabled, setDynamicEnabled] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      const results = await Promise.allSettled([
        fetch("/api/chat/models"),
        fetch("/api/admin/providers"),
        fetch("/api/admin/config"),
      ]);
      if (cancelled) return;

      let data: ApiModelsResponse = {};
      let dynamicProviders: DynamicProvider[] = [];
      const ds = new Set<string>();
      const de = new Map<string, boolean>();

      if (results[0].status === "fulfilled" && results[0].value.ok) {
        try {
          data = (await (
            results[0].value as Response
          ).json()) as ApiModelsResponse;
        } catch {
          /* ignore */
        }
      }
      if (results[1].status === "fulfilled" && results[1].value.ok) {
        try {
          const dpData = await (results[1].value as Response).json();
          if (dpData.success && Array.isArray(dpData.providers))
            dynamicProviders = dpData.providers;
        } catch {
          /* ignore */
        }
      }
      if (results[2].status === "fulfilled" && results[2].value.ok) {
        try {
          const adminData: AdminConfigResponse = await (
            results[2].value as Response
          ).json();
          const modelsCfg = adminData.config?.models;
          if (modelsCfg?.providers) {
            for (const [p, info] of Object.entries(modelsCfg.providers)) {
              if (!info.enabled) ds.add(p);
            }
          }
          if (modelsCfg?.dynamicProviders) {
            for (const [p, info] of Object.entries(
              modelsCfg.dynamicProviders,
            )) {
              de.set(p, info.enabled ?? false);
            }
          }
        } catch {
          /* ignore */
        }
      }

      setDisabledSet(ds);
      setDynamicEnabled(de);
      const merged = mergeDynamicProviders(
        transformApiResponse(data),
        dynamicProviders,
      );
      setAllProviders(filterDisabledProviders(merged, ds, de));
      setApiError(false);
      setLoading(false);
    }
    fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider = allProviders.find((p) => p.id === value.provider);
  const models = selectedProvider?.models ?? [];

  const handleProviderChange = (providerId: string) => {
    if (!isProviderEnabled(providerId, disabledSet, dynamicEnabled)) return;
    const provider = allProviders.find((p) => p.id === providerId);
    if (provider && provider.models.length > 0) {
      onChange({ provider: providerId, model: provider.models[0].name });
    } else {
      onChange({ provider: providerId, model: "" });
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-muted-foreground block mb-1">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            value={value.provider ?? ""}
            onChange={(e) => handleProviderChange(e.target.value)}
            disabled={disabled || loading}
            className="w-full h-9 px-3 pr-8 text-sm rounded-md border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {loading ? (
              <option value="">Loading...</option>
            ) : (
              <>
                <option value="">Provider</option>
                {allProviders.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      !isProviderEnabled(p.id, disabledSet, dynamicEnabled)
                    }
                  >
                    {p.name}
                    {p.models.length === 0 ? " (disabled)" : ""}
                  </option>
                ))}
              </>
            )}
          </select>
          {loading ? (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin pointer-events-none" />
          ) : (
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          )}
        </div>
        <div className="relative flex-1">
          <select
            value={value.model ?? ""}
            onChange={(e) =>
              onChange({ provider: value.provider, model: e.target.value })
            }
            disabled={disabled || !value.provider || models.length === 0}
            className="w-full h-9 px-3 pr-8 text-sm rounded-md border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="">{apiError ? "could not reach" : "Model"}</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {formatModelOption(m.name, m.metadata)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

export function SimpleModelSelector({
  value,
  onChange,
  providerId,
  disabled,
  label,
  className,
}: SimpleModelSelectorProps) {
  const allProviders = providerId
    ? STATIC_PROVIDERS.filter((p) => p.id === providerId)
    : STATIC_PROVIDERS;

  const models = providerId
    ? (STATIC_PROVIDERS.find((p) => p.id === providerId)?.models ?? [])
    : allProviders.flatMap((p) => p.models);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-muted-foreground block mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || models.length === 0}
          className="w-full h-9 px-3 pr-8 text-sm rounded-md border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="">Select model</option>
          {allProviders.map((p) =>
            p.models.map((m) => (
              <option key={`${p.id}-${m.name}`} value={m.name}>
                {formatModelOption(m.name, m.metadata)}
              </option>
            )),
          )}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

// Max fallbacks per provider to keep the UI simple
const MAX_FALLBACK_CHAIN = 3;

export interface FallbackChainValue {
  provider: string;
  model: string;
}

export interface FallbackChainSelectorProps {
  value: FallbackChainValue[];
  onChange: (chain: FallbackChainValue[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function FallbackChainSelector({
  value,
  onChange,
  disabled,
  label,
  className,
}: FallbackChainSelectorProps) {
  const [allProviders, setAllProviders] =
    useState<ProviderOption[]>(STATIC_PROVIDERS);
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());
  const [dynamicEnabled, setDynamicEnabled] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addProvider, setAddProvider] = useState("");
  const [addModel, setAddModel] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      const results = await Promise.allSettled([
        fetch("/api/chat/models"),
        fetch("/api/admin/providers"),
        fetch("/api/admin/config"),
      ]);
      if (cancelled) return;

      let data: ApiModelsResponse = {};
      let dynamicProviders: DynamicProvider[] = [];
      const ds = new Set<string>();
      const de = new Map<string, boolean>();

      if (results[0].status === "fulfilled" && results[0].value.ok) {
        try {
          data = (await (
            results[0].value as Response
          ).json()) as ApiModelsResponse;
        } catch {
          /* ignore */
        }
      }
      if (results[1].status === "fulfilled" && results[1].value.ok) {
        try {
          const dpData = await (results[1].value as Response).json();
          if (dpData.success && Array.isArray(dpData.providers))
            dynamicProviders = dpData.providers;
        } catch {
          /* ignore */
        }
      }
      if (results[2].status === "fulfilled" && results[2].value.ok) {
        try {
          const adminData: AdminConfigResponse = await (
            results[2].value as Response
          ).json();
          const modelsCfg = adminData.config?.models;
          if (modelsCfg?.providers) {
            for (const [p, info] of Object.entries(modelsCfg.providers)) {
              if (!info.enabled) ds.add(p);
            }
          }
          if (modelsCfg?.dynamicProviders) {
            for (const [p, info] of Object.entries(
              modelsCfg.dynamicProviders,
            )) {
              de.set(p, info.enabled ?? false);
            }
          }
        } catch {
          /* ignore */
        }
      }

      setDisabledSet(ds);
      setDynamicEnabled(de);
      const merged = mergeDynamicProviders(
        transformApiResponse(data),
        dynamicProviders,
      );
      setAllProviders(filterDisabledProviders(merged, ds, de));
      setApiError(false);
      setLoading(false);
    }
    fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAddProvider = allProviders.find((p) => p.id === addProvider);
  const addModels = selectedAddProvider?.models ?? [];
  const canAddMore = value.length < MAX_FALLBACK_CHAIN;

  const handleAddFallback = () => {
    if (!addProvider || !addModel) return;
    onChange([...value, { provider: addProvider, model: addModel }]);
    setAddProvider("");
    setAddModel("");
    setShowAdd(false);
  };

  const handleRemoveFallback = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleAddProviderChange = (providerId: string) => {
    setAddProvider(providerId);
    setAddModel("");
    const provider = allProviders.find((p) => p.id === providerId);
    if (provider && provider.models.length > 0) {
      setAddModel(provider.models[0].name);
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-muted-foreground block mb-1">
          {label}
        </label>
      )}

      {/* Fallback chain badges */}
      <div className="space-y-1.5 min-h-[24px]">
        {value.map((item, i) => {
          const providerLabel =
            allProviders.find((p) => p.id === item.provider)?.name ??
            item.provider;
          return (
            <div key={i} className="flex items-center gap-1.5 group">
              {i > 0 && (
                <span className="text-xs text-muted-foreground shrink-0">
                  then
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted border">
                <span className="font-medium text-muted-foreground">
                  {providerLabel}
                </span>
                <span className="text-foreground">{item.model}</span>
              </span>
              {!disabled && (
                <button
                  onClick={() => handleRemoveFallback(i)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                  title="Remove fallback"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add fallback button */}
      {!showAdd && canAddMore && !disabled && (
        <button
          onClick={() => setShowAdd(true)}
          className="h-8 px-3 text-xs rounded-md border border-dashed border-border hover:border-foreground/40 hover:bg-muted/50 transition-colors flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          Add fallback
        </button>
      )}

      {!canAddMore && !disabled && (
        <p className="text-xs text-muted-foreground">
          Max {MAX_FALLBACK_CHAIN} fallbacks per provider
        </p>
      )}

      {/* Inline add selector */}
      {showAdd && (
        <div className="flex gap-1.5 items-center">
          <div className="relative flex-1">
            <select
              value={addProvider}
              onChange={(e) => handleAddProviderChange(e.target.value)}
              disabled={disabled || loading}
              className="w-full h-8 px-2 pr-6 text-xs rounded-md border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="">{loading ? "Loading..." : "Provider"}</option>
              {allProviders.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={
                    !isProviderEnabled(p.id, disabledSet, dynamicEnabled)
                  }
                >
                  {p.name}
                  {p.models.length === 0 ? " (disabled)" : ""}
                </option>
              ))}
            </select>
            {loading ? (
              <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground animate-spin pointer-events-none" />
            ) : (
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            )}
          </div>
          <div className="relative flex-1">
            <select
              value={addModel}
              onChange={(e) => setAddModel(e.target.value)}
              disabled={disabled || !addProvider || addModels.length === 0}
              className="w-full h-8 px-2 pr-6 text-xs rounded-md border bg-background appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="">{apiError ? "could not reach" : "Model"}</option>
              {addModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {formatModelOption(m.name, m.metadata)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={handleAddFallback}
            disabled={!addProvider || !addModel}
            className="h-8 px-2 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowAdd(false);
              setAddProvider("");
              setAddModel("");
            }}
            className="h-8 px-2 text-xs rounded-md border border-border hover:bg-muted transition-colors flex items-center"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
