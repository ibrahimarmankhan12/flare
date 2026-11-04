"use client";

import { MessageSquare } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  TextAreaField,
  NumberField,
  SelectField,
  ToggleField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

const DEFAULTS = {
  defaultModel: "Gemini 3 Flash",
  defaultTheme: "system",
  defaultLocale: "en",
  defaultSidebarCollapsed: false,
  emptyState: {
    heading: "How can I help you today?",
    subheading:
      "Ask anything, generate images, run code, or build a small app.",
    starterPrompts: [
      "Summarize today's news in 5 bullets",
      "Draft a friendly product launch email",
      "Generate an image of a calm workspace",
      "Build a single-page React todo app",
    ],
  },
  maxAgentsPerUser: 25,
  maxToolsPerAgent: 30,
  maxThreadsPerUser: 500,
  promptPasteMaxLength: 1000,
};

export default function ChatDefaultsPage() {
  return (
    <AdminSettingsPage
      icon={<MessageSquare className="size-6 text-muted-foreground" />}
      title="Chat defaults"
      description="Default model, empty-state copy, starter prompts, and per-user guardrails."
      configKey="chat"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const emptyState =
          (config.emptyState as Record<string, unknown>) ?? DEFAULTS.emptyState;
        const starterPrompts =
          (emptyState.starterPrompts as string[]) ??
          DEFAULTS.emptyState.starterPrompts;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Defaults"
              description="Applied to new users on first sign-in."
            >
              <div>
                <FieldLabel>Default model</FieldLabel>
                <TextField
                  value={config.defaultModel as string | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, defaultModel: v }))
                  }
                  placeholder="Claude Sonnet 4.5"
                />
              </div>
              <div>
                <FieldLabel>Default theme</FieldLabel>
                <SelectField
                  value={
                    config.defaultTheme as
                      | "light"
                      | "dark"
                      | "system"
                      | undefined
                  }
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, defaultTheme: v }))
                  }
                  options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </div>
              <div>
                <FieldLabel>Default locale</FieldLabel>
                <TextField
                  value={config.defaultLocale as string | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, defaultLocale: v }))
                  }
                  placeholder="en"
                />
              </div>
              <ToggleField
                value={config.defaultSidebarCollapsed as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, defaultSidebarCollapsed: v }))
                }
                label="Default sidebar collapsed"
              />
              <div>
                <FieldLabel hint="Maximum characters accepted by the prompt input on paste.">
                  Prompt paste max length
                </FieldLabel>
                <NumberField
                  value={config.promptPasteMaxLength as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, promptPasteMaxLength: v }))
                  }
                  min={100}
                  max={100000}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Empty state"
              description="Heading, subheading, and starter prompts shown on a fresh chat."
            >
              <div>
                <FieldLabel>Heading</FieldLabel>
                <TextField
                  value={emptyState.heading as string | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      emptyState: { ...emptyState, heading: v },
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel>Subheading</FieldLabel>
                <TextAreaField
                  value={emptyState.subheading as string | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      emptyState: { ...emptyState, subheading: v },
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel hint="One prompt per line. Shown as cards under the heading.">
                  Starter prompts
                </FieldLabel>
                <textarea
                  value={starterPrompts.join("\n")}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      emptyState: {
                        ...emptyState,
                        starterPrompts: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  rows={6}
                  className="w-full px-3 py-2 text-sm rounded-md border bg-background resize-y"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Per-user guardrails"
              description="Soft limits; users can be lifted individually in the Users tab."
            >
              <div>
                <FieldLabel>Max agents per user</FieldLabel>
                <NumberField
                  value={config.maxAgentsPerUser as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxAgentsPerUser: v }))
                  }
                  min={1}
                />
              </div>
              <div>
                <FieldLabel>Max tools per agent</FieldLabel>
                <NumberField
                  value={config.maxToolsPerAgent as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxToolsPerAgent: v }))
                  }
                  min={1}
                />
              </div>
              <div>
                <FieldLabel>Max threads per user</FieldLabel>
                <NumberField
                  value={config.maxThreadsPerUser as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, maxThreadsPerUser: v }))
                  }
                  min={1}
                />
              </div>
            </SectionCard>
          </div>
        );
      }}
    />
  );
}
