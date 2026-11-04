"use client";

import { Server } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  NumberField,
  ToggleField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

const DEFAULTS = {
  featuredServerIds: [] as string[],
  allowPreAuthSave: true,
  connectionTestTimeoutSeconds: 15,
  syncCooldownSeconds: 30,
};

export default function McpPage() {
  return (
    <AdminSettingsPage
      icon={<Server className="size-6 text-muted-foreground" />}
      title="MCP"
      description="Curate which public MCP servers show as 'featured' and tune connection behavior."
      configKey="mcp"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const featured =
          (config.featuredServerIds as string[]) ??
          DEFAULTS.featuredServerIds;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Featured servers"
              description="Server IDs (one per line) that should always be promoted in the MCP dashboard. Leave empty to fall back to the top 6 public servers."
            >
              <FieldLabel hint="Server IDs, one per line.">
                Featured server IDs
              </FieldLabel>
              <textarea
                value={featured.join("\n")}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    featuredServerIds: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                rows={6}
                className="w-full px-3 py-2 text-sm rounded-md border bg-background resize-y font-mono"
                placeholder={"canva\ngithub\ngmail"}
              />
            </SectionCard>

            <SectionCard
              title="Connection behavior"
              description="Controls how the dashboard connects to and re-syncs MCP servers."
            >
              <ToggleField
                value={config.allowPreAuthSave as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, allowPreAuthSave: v }))
                }
                label="Allow pre-authorization save"
                description="Permit saving OAuth-requiring servers before authorization completes (e.g. Canva)."
              />
              <div>
                <FieldLabel hint="Maximum time to wait for a server connection test before marking it failed.">
                  Connection test timeout (seconds)
                </FieldLabel>
                <NumberField
                  value={
                    config.connectionTestTimeoutSeconds as number | undefined
                  }
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      connectionTestTimeoutSeconds: v,
                    }))
                  }
                  min={5}
                  max={120}
                />
              </div>
              <div>
                <FieldLabel hint="Cooldown between repeated sync attempts to avoid storms.">
                  Sync cooldown (seconds)
                </FieldLabel>
                <NumberField
                  value={config.syncCooldownSeconds as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, syncCooldownSeconds: v }))
                  }
                  min={0}
                  max={600}
                />
              </div>
            </SectionCard>
          </div>
        );
      }}
    />
  );
}
