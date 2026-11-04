"use client";

import { BoxIcon, CheckCircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Switch } from "ui/switch";

interface CanvasConfig {
  model?: string;
  defaultSlideCount?: number;
  pptxExportEnabled?: boolean;
}

export function CanvasTab({ initialConfig }: { initialConfig: CanvasConfig }) {
  const [config, setConfig] = useState<CanvasConfig>(
    initialConfig ?? {
      model: "Claude Opus 4.6",
      defaultSlideCount: 10,
      pptxExportEnabled: true,
    },
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "canvas", settings: config }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BoxIcon className="size-5" />
            Canvas Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Canvas presentation and HTML generation settings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircleIcon className="size-4" />
              Saved
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-card space-y-4 max-w-lg">
        <div>
          <label className="text-sm font-medium block mb-1">Model</label>
          <Input
            value={config.model ?? ""}
            onChange={(e) =>
              setConfig((c) => ({ ...c, model: e.target.value }))
            }
            placeholder="e.g. Claude Opus 4.6, Gemini 3 Flash"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Model used for generating Canvas content (presentations, HTML).
          </p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">
            Default Slide Count
          </label>
          <Input
            type="number"
            value={config.defaultSlideCount ?? 10}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                defaultSlideCount: parseInt(e.target.value) || 10,
              }))
            }
            className="text-sm w-32"
            min={1}
            max={50}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">PPTX Export</span>
            <p className="text-xs text-muted-foreground">
              Enable PowerPoint export for presentations.
            </p>
          </div>
          <Switch
            checked={config.pptxExportEnabled ?? true}
            onCheckedChange={(v) =>
              setConfig((c) => ({ ...c, pptxExportEnabled: v }))
            }
          />
        </div>
      </div>
    </div>
  );
}
