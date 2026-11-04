"use client";

import { useState } from "react";
import { BotIcon, CheckCircleIcon } from "lucide-react";
import { Switch } from "ui/switch";
import { Input } from "ui/input";
import { Button } from "ui/button";

interface ModelsConfig {
  providers: Record<
    string,
    {
      enabled: boolean;
      defaultModel?: string;
      apiKeyConfigured: boolean;
      fallbackModel?: string;
    }
  >;
  globalFallback?: string;
}

interface Props {
  initialConfig: ModelsConfig;
}

export function ModelsTab({ initialConfig }: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const setDefaultModel = (provider: string, model: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          defaultModel: model,
        },
      },
    }));
  };

  const setFallbackModel = (provider: string, model: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          fallbackModel: model,
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "models", settings: config }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const providers = Object.entries(config.providers ?? {}).sort(
    ([a], [b]) => Number(b === "flare") - Number(a === "flare"),
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BotIcon className="size-5" />
            Model Providers
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enable/disable providers and configure defaults and fallbacks.
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

      <div className="space-y-4">
        {providers.map(([provider, data]) => (
          <div
            key={provider}
            className="border rounded-lg p-4 space-y-3 bg-card"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium capitalize">{provider}</span>
                {data.apiKeyConfigured ? (
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
                <span className="text-xs text-muted-foreground">
                  {data.enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={data.enabled}
                  onCheckedChange={() => toggleProvider(provider)}
                />
              </div>
            </div>

            {data.enabled && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Default Model
                  </label>
                  <Input
                    value={data.defaultModel ?? ""}
                    onChange={(e) =>
                      setDefaultModel(provider, e.target.value)
                    }
                    placeholder={`Default ${provider} model`}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Fallback Model
                  </label>
                  <Input
                    value={data.fallbackModel ?? ""}
                    onChange={(e) =>
                      setFallbackModel(provider, e.target.value)
                    }
                    placeholder="Fallback model name"
                    className="text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}