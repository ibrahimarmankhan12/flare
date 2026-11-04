"use client";

import { CheckCircleIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";

interface ArtifactsConfig {
  model?: string;
  enabledTypes?: string[];
}

const ARTIFACT_TYPES = [
  { id: "html", label: "HTML" },
  { id: "react", label: "React" },
  { id: "slides", label: "Slides" },
  { id: "svg", label: "SVG" },
  { id: "mermaid", label: "Mermaid Diagrams" },
];

export function ArtifactsTab({
  initialConfig,
}: { initialConfig: ArtifactsConfig }) {
  const [config, setConfig] = useState<ArtifactsConfig>(
    initialConfig ?? {
      model: "Claude Opus 4.6",
      enabledTypes: ["html", "react", "slides"],
    },
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "artifacts", settings: config }),
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
            <SparklesIcon className="size-5" />
            Artifacts Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure artifact generation model and enabled types.
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
            placeholder="e.g. GPT 5.5"
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-3">
            Enabled Types
          </label>
          <div className="flex flex-wrap gap-3">
            {ARTIFACT_TYPES.map((type) => (
              <label
                key={type.id}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={config.enabledTypes?.includes(type.id) ?? false}
                  onChange={() => toggleType(type.id)}
                  className="rounded"
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
