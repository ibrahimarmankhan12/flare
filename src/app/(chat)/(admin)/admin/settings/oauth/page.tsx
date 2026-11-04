"use client";

import { KeyRound } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  ToggleField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

// Defaults shown in the form when no DB override exists. The runtime
// merges these with deep-merge so adding a new field here is safe.
const DEFAULTS = {
  disableSignUp: false,
  disableEmailSignIn: false,
  emailChangeEnabled: true,
  userDeleteEnabled: true,
  providers: {
    google: {
      enabled: true,
      clientId: "",
      clientSecret: "",
      forceAccountSelection: false,
    },
    github: {
      enabled: true,
      clientId: "",
      clientSecret: "",
    },
    microsoft: {
      enabled: true,
      clientId: "",
      clientSecret: "",
      forceAccountSelection: false,
      tenantId: "common",
    },
    slack: {
      enabled: true,
      clientId: "",
      clientSecret: "",
    },
    notion: {
      enabled: true,
      clientId: "",
      clientSecret: "",
    },
  },
};

interface ProviderMeta {
  key: "google" | "github" | "microsoft" | "slack" | "notion";
  label: string;
  // Env var names shown as a hint when the admin hasn't filled in
  // clientId/clientSecret in the form (so the operator knows the fallback
  // is still respected).
  envHint: string;
  description: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    key: "google",
    label: "Google",
    envHint: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
    description:
      "Used for sign-in and the Gmail / Drive / Calendar connectors.",
  },
  {
    key: "github",
    label: "GitHub",
    envHint: "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET",
    description: "Used for sign-in and the GitHub issues / PRs connector.",
  },
  {
    key: "microsoft",
    label: "Microsoft / Entra",
    envHint: "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET",
    description: "Used for sign-in and the Outlook mail connector.",
  },
  {
    key: "slack",
    label: "Slack",
    envHint: "SLACK_CLIENT_ID / SLACK_CLIENT_SECRET",
    description: "Slack connector only (no Slack sign-in).",
  },
  {
    key: "notion",
    label: "Notion",
    envHint: "NOTION_CLIENT_ID / NOTION_CLIENT_SECRET",
    description: "Notion connector only (no Notion sign-in).",
  },
];

export default function OAuthPage() {
  return (
    <AdminSettingsPage
      icon={<KeyRound className="size-6 text-muted-foreground" />}
      title="OAuth & Auth"
      description="Toggle social sign-in providers, set OAuth client credentials, and configure global auth behavior. Credentials set here override the matching env vars so admins can rotate secrets without redeploying."
      configKey="oauth"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const providers =
          (config.providers as Record<string, Record<string, unknown>>) ??
          DEFAULTS.providers;
        const setProvider = (key: string, patch: Record<string, unknown>) =>
          setConfig((c) => ({
            ...c,
            providers: { ...providers, [key]: { ...providers[key], ...patch } },
          }));
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Global behavior"
              description="Applies to every sign-in method, including email + password."
            >
              <ToggleField
                value={config.disableSignUp as boolean | undefined}
                onChange={(v) => setConfig((c) => ({ ...c, disableSignUp: v }))}
                label="Disable sign-up"
                description="Block new account creation. Existing users can still sign in."
              />
              <ToggleField
                value={config.disableEmailSignIn as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, disableEmailSignIn: v }))
                }
                label="Disable email + password sign-in"
                description="Force users to use a social provider."
              />
              <ToggleField
                value={config.emailChangeEnabled as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, emailChangeEnabled: v }))
                }
                label="Allow email change"
              />
              <ToggleField
                value={config.userDeleteEnabled as boolean | undefined}
                onChange={(v) =>
                  setConfig((c) => ({ ...c, userDeleteEnabled: v }))
                }
                label="Allow self-delete account"
              />
            </SectionCard>

            {PROVIDERS.map(({ key, label, envHint, description }) => (
              <SectionCard
                key={key}
                title={label}
                description={description}
              >
                <ToggleField
                  value={providers[key]?.enabled as boolean | undefined}
                  onChange={(v) => setProvider(key, { enabled: v })}
                  label={`${label} enabled`}
                />

                {/* Credential inputs — leave empty to use the env vars. */}
                <div>
                  <FieldLabel
                    hint={`Leave blank to use the ${envHint} env var.`}
                  >
                    Client ID
                  </FieldLabel>
                  <TextField
                    value={providers[key]?.clientId as string | undefined}
                    onChange={(v) => setProvider(key, { clientId: v })}
                    placeholder={
                      providers[key]?.clientId
                        ? "•••• set ••••"
                        : "Paste OAuth client ID…"
                    }
                  />
                </div>
                <div>
                  <FieldLabel
                    hint={`Leave blank to use the ${envHint} env var. Stored as-is; the API route does not echo this back after save.`}
                  >
                    Client secret
                  </FieldLabel>
                  <TextField
                    value={providers[key]?.clientSecret as string | undefined}
                    onChange={(v) => setProvider(key, { clientSecret: v })}
                    placeholder={
                      providers[key]?.clientSecret
                        ? "•••• stored ••••"
                        : "Paste OAuth client secret…"
                    }
                  />
                </div>

                {/* Sign-in-only knobs. Connectors ignore them. */}
                {key !== "github" && key !== "slack" && key !== "notion" && (
                  <ToggleField
                    value={
                      (providers[key]?.forceAccountSelection as boolean) ?? false
                    }
                    onChange={(v) =>
                      setProvider(key, { forceAccountSelection: v })
                    }
                    label="Force account selection"
                    description="Always show the account picker, even on remembered browsers."
                  />
                )}
                {key === "microsoft" && (
                  <div>
                    <FieldLabel hint="Azure AD tenant ID. Use 'common' for multi-tenant.">
                      Tenant ID
                    </FieldLabel>
                    <TextField
                      value={
                        (providers.microsoft?.tenantId as string) ?? "common"
                      }
                      onChange={(v) =>
                        setProvider("microsoft", { tenantId: v })
                      }
                    />
                  </div>
                )}
              </SectionCard>
            ))}
          </div>
        );
      }}
    />
  );
}
