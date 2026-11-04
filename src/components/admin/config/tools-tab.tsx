"use client";

import { useState } from "react";
import {
  WrenchIcon,
  ChevronDown,
  ChevronRight,
  CheckCircleIcon,
  Loader2,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { TOOLKIT_CATALOG } from "lib/ai/tools/toolkit-catalog";
import { Switch } from "ui/switch";
import { Button } from "ui/button";
import {
  showSaveSuccess,
  showSaveError,
} from "@/components/admin/ui/toast-helpers";

// Derived from the toolkit catalog. This list is what writes
// `site_config.tools.categories`, and anything missing from that row is
// treated as disabled at runtime — so a hand-maintained copy here silently
// made whole toolkits uncallable.
const TOOL_CATEGORIES = TOOLKIT_CATALOG.map((t) => ({
  id: t.configKey,
  label: t.label,
  icon: t.icon,
  tools: t.tools,
  desc: t.description,
}));

const API_KEYS = [
  { id: "exa", label: "Exa AI (Web Search)", key: "EXA_API_KEY" },
  { id: "firecrawl", label: "Firecrawl (Browser)", key: "FIRECRAWL_API_KEY" },
  { id: "youtube", label: "YouTube Data API", key: "YOUTUBE_API_KEY" },
  { id: "supadata", label: "Supadata (Transcripts)", key: "SUPADATA_API_KEY" },
  { id: "konvo", label: "KonvO (Speech/OCR)", key: "KONVO_AI_API" },
];

interface ToolsConfig {
  categories: Record<
    string,
    {
      enabled: boolean;
      tools: Record<string, boolean>;
    }
  >;
  apiKeys: Record<string, boolean>;
}

interface ToolsTabProps {
  initialConfig: ToolsConfig;
  onSave: (config: ToolsConfig) => Promise<void>;
  isDirty: boolean;
}

export function ToolsTabContent({
  initialConfig,
  onSave,
  isDirty,
}: ToolsTabProps) {
  const [config, setConfig] = useState<ToolsConfig>(initialConfig);
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(TOOL_CATEGORIES.map((c) => c.id)),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);

  const toggleCategory = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [id]: {
          enabled: !prev.categories[id]?.enabled,
          tools: prev.categories[id]?.tools ?? {},
        },
      },
    }));
  };

  const toggleAllInCategory = (catId: string, enabled: boolean) => {
    setConfig((prev) => {
      const cat = prev.categories[catId] ?? { enabled: true, tools: {} };
      const toolEntries =
        TOOL_CATEGORIES.find((c) => c.id === catId)?.tools ?? [];
      const newTools: Record<string, boolean> = {};
      toolEntries.forEach((t) => {
        newTools[t] = enabled;
      });
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [catId]: {
            ...cat,
            enabled: enabled,
            tools: newTools,
          },
        },
      };
    });
  };

  const toggleTool = (catId: string, tool: string) => {
    setConfig((prev) => {
      const cat = prev.categories[catId] ?? { enabled: true, tools: {} };
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [catId]: {
            ...cat,
            tools: {
              ...cat.tools,
              [tool]: !cat.tools[tool],
            },
          },
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(config);
      setSaved(true);
      showSaveSuccess("Tools configuration saved");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      showSaveError("Failed to save tools configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (
      !window.confirm(
        "Reset to saved values? Any unsaved changes will be lost.",
      )
    )
      return;
    setConfig(initialConfig);
    setOpenCategories(new Set(TOOL_CATEGORIES.map((c) => c.id)));
  };

  const enabledCount = Object.values(config.categories ?? {}).filter(
    (c) => c.enabled,
  ).length;
  const totalTools = TOOL_CATEGORIES.reduce(
    (acc, cat) => acc + cat.tools.length,
    0,
  );
  const enabledTools = Object.values(config.categories ?? {}).reduce(
    (acc, cat) => acc + Object.values(cat.tools ?? {}).filter(Boolean).length,
    0,
  );

  const enabledApiKeys = Object.entries(config.apiKeys ?? {}).filter(
    ([, v]) => v,
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <WrenchIcon className="size-6 text-muted-foreground" />
            Tools
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {enabledCount}/{TOOL_CATEGORIES.length} categories, {enabledTools}/
            {totalTools} tools enabled
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
              <CheckCircleIcon className="size-4" />
              Saved
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saving || !isDirty} size="sm">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>

      {/* API Keys Status */}
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">API Key Status</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabledApiKeys}/{API_KEYS.length} API keys configured
            </p>
          </div>
          <button
            onClick={() => setShowApiKeys((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showApiKeys ? (
              <>
                <EyeOff className="size-3" />
                Hide details
              </>
            ) : (
              <>
                <Eye className="size-3" />
                Show details
              </>
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {API_KEYS.map((apiKey) => {
            const configured = config.apiKeys?.[apiKey.id] ?? false;
            return (
              <div
                key={apiKey.id}
                className="flex items-center justify-between p-2 rounded-lg border bg-background/50"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{apiKey.label}</p>
                  {showApiKeys && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {apiKey.key}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    configured
                      ? "bg-green-500/10 text-green-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {configured ? "Set" : "Missing"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tool Categories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Tool Categories
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() =>
                TOOL_CATEGORIES.forEach((c) =>
                  setOpenCategories((prev) => new Set([...prev, c.id])),
                )
              }
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Expand all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => setOpenCategories(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Collapse all
            </button>
          </div>
        </div>

        {TOOL_CATEGORIES.map((cat) => {
          const catConfig = config.categories?.[cat.id];
          const enabled = catConfig?.enabled ?? true;
          const open = openCategories.has(cat.id);
          const catEnabledTools = Object.values(catConfig?.tools ?? {}).filter(
            Boolean,
          ).length;

          return (
            <div
              key={cat.id}
              className={`border rounded-xl bg-card overflow-hidden transition-colors ${
                enabled ? "" : "opacity-60"
              }`}
            >
              {/* Category header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  setOpenCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat.id)) next.delete(cat.id);
                    else next.add(cat.id);
                    return next;
                  });
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{cat.icon}</span>
                  <div>
                    <span className="text-sm font-medium">{cat.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      — {cat.desc}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {catEnabledTools}/{cat.tools.length}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Category enable toggle */}
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => {
                      toggleCategory(cat.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {/* Expand/collapse */}
                  <button className="p-1 text-muted-foreground hover:text-foreground">
                    {open ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Tools list (collapsible) */}
              {open && (
                <div className="border-t px-4 py-3 space-y-2">
                  {/* Quick actions */}
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => toggleAllInCategory(cat.id, true)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Enable all
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      onClick={() => toggleAllInCategory(cat.id, false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Disable all
                    </button>
                  </div>

                  {cat.tools.map((tool) => {
                    const toolEnabled = catConfig?.tools?.[tool] ?? true;
                    return (
                      <div
                        key={tool}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-sm">{tool}</span>
                        <Switch
                          checked={toolEnabled}
                          onCheckedChange={() => toggleTool(cat.id, tool)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { TOOL_CATEGORIES };
