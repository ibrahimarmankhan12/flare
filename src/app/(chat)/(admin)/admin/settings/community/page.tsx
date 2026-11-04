"use client";

import { Users } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  NumberField,
  ToggleField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

const DEFAULTS = {
  enabled: true,
  allowAnonymousPosts: true,
  maxPostLength: 4000,
  maxTagsPerPost: 8,
  maxMediaPerPost: 1,
  allowedMediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  maxMediaSizeMB: 8,
  feedTabs: ["For You", "Trending", "Latest", "Following"],
  showInSidebar: true,
};

export default function CommunityPage() {
  return (
    <AdminSettingsPage
      icon={<Users className="size-6 text-muted-foreground" />}
      title="Community"
      description="Toggle the community feed, set content limits, and choose which tabs to show."
      configKey="community"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const allowed =
          (config.allowedMediaTypes as string[]) ??
          DEFAULTS.allowedMediaTypes;
        const tabs =
          (config.feedTabs as string[]) ?? DEFAULTS.feedTabs;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Feature"
              description="Master switch for the community feed."
            >
              <ToggleField
                value={config.enabled as boolean | undefined}
                onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
                label="Community enabled"
                description="When disabled, the page returns 404 and sidebar entry is hidden."
              />
              <ToggleField
                value={config.showInSidebar as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, showInSidebar: v }))
                }
                label="Show in sidebar"
              />
              <ToggleField
                value={config.allowAnonymousPosts as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, allowAnonymousPosts: v }))
                }
                label="Allow anonymous posts"
                description="Posts made before sign-in via Firebase anonymous auth."
              />
            </SectionCard>

            <SectionCard
              title="Content limits"
              description="Per-post hard limits enforced by the API."
            >
              <div>
                <FieldLabel>Max post length (chars)</FieldLabel>
                <NumberField
                  value={config.maxPostLength as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxPostLength: v }))
                  }
                  min={140}
                />
              </div>
              <div>
                <FieldLabel>Max tags per post</FieldLabel>
                <NumberField
                  value={config.maxTagsPerPost as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxTagsPerPost: v }))
                  }
                  min={0}
                  max={32}
                />
              </div>
              <div>
                <FieldLabel>Max media items per post</FieldLabel>
                <NumberField
                  value={config.maxMediaPerPost as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxMediaPerPost: v }))
                  }
                  min={0}
                  max={10}
                />
              </div>
              <div>
                <FieldLabel hint="Max upload size per media item, in megabytes.">
                  Max media size (MB)
                </FieldLabel>
                <NumberField
                  value={config.maxMediaSizeMB as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxMediaSizeMB: v }))
                  }
                  min={1}
                  max={100}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Allowed media types"
              description="Comma-separated MIME types. Uploads with other types are rejected."
            >
              <TextField
                value={allowed.join(", ")}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    allowedMediaTypes: v
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="image/png, image/jpeg, image/webp"
              />
            </SectionCard>

            <SectionCard
              title="Feed tabs"
              description="Order is preserved. Tabs not in this list are hidden from the feed."
            >
              <textarea
                value={tabs.join("\n")}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    feedTabs: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-md border bg-background resize-y"
              />
            </SectionCard>
          </div>
        );
      }}
    />
  );
}
