"use client";

import { useState } from "react";
import { Settings2Icon, CheckCircleIcon } from "lucide-react";
import { Input } from "ui/input";
import { Button } from "ui/button";
import { Switch } from "ui/switch";

interface GeneralConfig {
  appName?: string;
  appLogoUrl?: string;
  defaultToolChoice?: "auto" | "none" | "manual" | "codemode";
  freeTierDailyTokenLimit?: number;
  freeTierEnabled?: boolean;
}

export function GeneralTab({
  initialConfig,
}: { initialConfig: GeneralConfig }) {
  const [config, setConfig] = useState<GeneralConfig>(
    initialConfig ?? {
      appName: "Flare AI",
      appLogoUrl: "/flare-logo-512.webp",
      defaultToolChoice: "auto",
      freeTierDailyTokenLimit: 150000,
      freeTierEnabled: true,
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
        body: JSON.stringify({ key: "general", settings: config }),
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
            <Settings2Icon className="size-5" />
            General Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            App-level configuration and defaults.
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
          <label className="text-sm font-medium block mb-1">App Name</label>
          <Input
            value={config.appName ?? ""}
            onChange={(e) =>
              setConfig((c) => ({ ...c, appName: e.target.value }))
            }
            placeholder="Flare AI"
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Logo URL</label>
          <Input
            value={config.appLogoUrl ?? ""}
            onChange={(e) =>
              setConfig((c) => ({ ...c, appLogoUrl: e.target.value }))
            }
            placeholder="/flare-logo-512.webp"
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">
            Default Tool Choice
          </label>
          <div className="flex gap-3 text-sm text-muted-foreground">
            {(["auto", "none", "manual", "codemode"] as const).map((mode) => (
              <label
                key={mode}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <input
                  type="radio"
                  name="toolChoice"
                  checked={config.defaultToolChoice === mode}
                  onChange={() =>
                    setConfig((c) => ({ ...c, defaultToolChoice: mode }))
                  }
                />
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Free Tier</span>
            <p className="text-xs text-muted-foreground">
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
            <label className="text-sm font-medium block mb-1">
              Daily Token Limit
            </label>
            <Input
              type="number"
              value={config.freeTierDailyTokenLimit ?? 150000}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  freeTierDailyTokenLimit: parseInt(e.target.value) || 150000,
                }))
              }
              className="text-sm w-40"
              min={0}
            />
          </div>
        )}
      </div>
    </div>
  );
}
