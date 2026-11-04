"use client";

import { useState, useEffect, useCallback } from "react";
import { SparklesIcon, Loader2, CheckCircle2Icon, RotateCcw } from "lucide-react";
import { Button } from "ui/button";
import { ModelSelector } from "@/components/admin/ui/model-selector";
import { showSaveSuccess, showSaveError } from "@/components/admin/ui/toast-helpers";
import { ShortcutHelpModal, useAdminShortcuts } from "@/components/admin/ui/shortcut-help-modal";

interface ArtifactsConfig {
  model?: string;
  enabledTypes?: string[];
}

const ARTIFACT_TYPES = [
  { id: "html", label: "HTML", desc: "Interactive HTML files" },
  { id: "react", label: "React", desc: "React components" },
  { id: "slides", label: "Slides", desc: "Presentation slides" },
  { id: "svg", label: "SVG", desc: "Scalable vector graphics" },
  { id: "mermaid", label: "Mermaid", desc: "Mermaid diagrams" },
];

export default function ArtifactsPage() {
  const [config, setConfig] = useState<ArtifactsConfig>({
    model: "Gemini 3 Flash",
    enabledTypes: ["html", "react", "slides"],
  });
  const [initialConfig, setInitialConfig] = useState<ArtifactsConfig>({
    model: "Gemini 3 Flash",
    enabledTypes: ["html", "react", "slides"],
  });
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
        if (d.success && d.config?.artifacts) {
          setConfig(d.config.artifacts);
          setInitialConfig(d.config.artifacts);
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
        body: JSON.stringify({ key: "artifacts", settings: config }),
      });
      if (res.ok) {
        setInitialConfig(config);
        setSaved(true);
        showSaveSuccess("Artifacts configuration saved");
        setTimeout(() => setSaved(false), 3000);
      } else {
        showSaveError("Failed to save artifacts configuration");
      }
    } catch {
      showSaveError("Failed to save artifacts configuration");
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

  const toggleType = (id: string) => {
    setConfig((prev) => {
      const types = prev.enabledTypes ?? [];
      return {
        ...prev,
        enabledTypes: types.includes(id)
          ? types.filter((t) => t !== id)
          : [...types, id],
      };
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="border rounded-xl bg-card p-5 space-y-4 max-w-2xl">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
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
            <SparklesIcon className="size-6 text-muted-foreground" />
            Artifacts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure artifact generation model and enabled output types.
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
              if (window.confirm("Reset to saved values? Any unsaved changes will be lost.")) {
                setConfig(initialConfig);
              }
            }}
            className="h-9 px-3 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
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
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </div>

      <div className="border rounded-xl bg-card p-5 space-y-6 max-w-2xl">
        {/* Model */}
        <div>
          <label className="text-sm font-medium block mb-1.5">Artifact Model</label>
          <ModelSelector
            label=""
            providerId="flare"
            value={config.model ?? "Gemini 3 Flash"}
            onChange={(v) => setConfig((c) => ({ ...c, model: v }))}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Model used for generating code artifacts (HTML, React, SVG, etc.).
          </p>
        </div>

        <div className="border-t pt-4">
          <label className="text-sm font-medium block mb-3">Enabled Types</label>
          <div className="grid grid-cols-2 gap-3">
            {ARTIFACT_TYPES.map((type) => {
              const enabled = config.enabledTypes?.includes(type.id) ?? false;
              return (
                <div
                  key={type.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    enabled
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                  onClick={() => toggleType(type.id)}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleType(type.id)}
                    className="size-4 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium">{type.label}</span>
                    <p className="text-xs text-muted-foreground">{type.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
