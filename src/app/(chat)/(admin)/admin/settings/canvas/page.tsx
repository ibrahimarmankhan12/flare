"use client";

import { useState, useEffect, useCallback } from "react";
import { BoxIcon, Loader2, CheckCircle2Icon, RotateCcw } from "lucide-react";
import { Button } from "ui/button";
import { Switch } from "ui/switch";
import { ModelSelector } from "@/components/admin/ui/model-selector";
import { showSaveSuccess, showSaveError } from "@/components/admin/ui/toast-helpers";
import { ShortcutHelpModal, useAdminShortcuts } from "@/components/admin/ui/shortcut-help-modal";

interface CanvasConfig {
  model?: string;
  defaultSlideCount?: number;
  pptxExportEnabled?: boolean;
}

export default function CanvasPage() {
  const [config, setConfig] = useState<CanvasConfig>({
    model: "Claude Opus 4.6",
    defaultSlideCount: 10,
    pptxExportEnabled: true,
  });
  const [initialConfig, setInitialConfig] = useState<CanvasConfig>({
    model: "Claude Opus 4.6",
    defaultSlideCount: 10,
    pptxExportEnabled: true,
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
        if (d.success && d.config?.canvas) {
          setConfig(d.config.canvas);
          setInitialConfig(d.config.canvas);
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
        body: JSON.stringify({ key: "canvas", settings: config }),
      });
      if (res.ok) {
        setSaved(true);
        setInitialConfig(config);
        showSaveSuccess("Canvas configuration saved");
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="border rounded-xl bg-card p-5 space-y-4 max-w-2xl">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <>
      <ShortcutHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BoxIcon className="size-6 text-muted-foreground" />
            Canvas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Canvas presentation and HTML generation model.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1.5">
              <CheckCircle2Icon className="size-4" /> Saved
            </span>
          )}
          <button onClick={() => setConfig(initialConfig)} className="h-9 px-3 text-sm rounded-md border bg-background hover:bg-muted flex items-center gap-1.5 text-muted-foreground">
            <RotateCcw className="size-3.5" /> Reset
          </button>
          <Button onClick={handleSave} disabled={saving || !isDirty} size="sm">
            {saving ? (
              <><Loader2 className="size-4 animate-spin mr-2" />Saving...</>
            ) : "Save Changes"}
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

      <div className="border rounded-xl bg-card p-5 space-y-5 max-w-2xl">
        <div>
          <label className="text-sm font-medium block mb-1.5">Canvas Model</label>
          <ModelSelector
            providerId="flare"
            value={config.model ?? "Claude Opus 4.6"}
            onChange={(v) => setConfig((c) => ({ ...c, model: v }))}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Model used for generating Canvas content (presentations, HTML).
          </p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Default Slide Count</label>
          <input
            type="number"
            value={config.defaultSlideCount ?? 10}
            onChange={(e) =>
              setConfig((c) => ({ ...c, defaultSlideCount: parseInt(e.target.value) || 10 }))
            }
            className="h-9 w-32 px-3 text-sm rounded-md border bg-background"
            min={1}
            max={50}
          />
          <p className="text-xs text-muted-foreground mt-1">Default number of slides per presentation (1–50).</p>
        </div>

        <div className="flex items-center justify-between py-2 border-t">
          <div>
            <span className="text-sm font-medium">PPTX Export</span>
            <p className="text-xs text-muted-foreground mt-0.5">Enable PowerPoint export for presentations.</p>
          </div>
          <Switch
            checked={config.pptxExportEnabled ?? true}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, pptxExportEnabled: v }))}
          />
        </div>
      </div>
    </div>
    </>
  );
}