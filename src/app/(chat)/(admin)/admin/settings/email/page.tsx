"use client";

import { Mail } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  ToggleField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

const DEFAULTS = {
  enabled: true,
  regionDomain: "flare-sh.tech",
  defaultCountry: "US",
  displayNames: {
    security: "Flare Security",
    auth: "Flare",
    noreply: "Flare",
    payments: "Flare Payments",
  },
  senderPrefixes: ["security", "auth", "noreply", "payments"],
  euCountries: [
    "DE",
    "FR",
    "IT",
    "ES",
    "NL",
    "BE",
    "SE",
    "DK",
    "FI",
    "IE",
    "PL",
    "AT",
    "CZ",
  ],
  regionApiKeyEnv: {
    US: "RESEND_API_KEY_US",
    IN: "RESEND_API_KEY_IN",
    CN: "RESEND_API_KEY_CHIN",
    EU: "RESEND_API_KEY_EU",
    AU: "RESEND_API_KEY_AUSTRALIA",
    SG: "RESEND_API_KEY_SINGAPORE",
    BR: "RESEND_API_KEY_BRAZIL",
  },
};

export default function EmailPage() {
  return (
    <AdminSettingsPage
      icon={<Mail className="size-6 text-muted-foreground" />}
      title="Email & Resend"
      description="Sender identity, region routing, and per-prefix display names for transactional emails."
      configKey="email"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const displayNames =
          (config.displayNames as Record<string, string>) ?? DEFAULTS.displayNames;
        const euCountries =
          (config.euCountries as string[]) ?? DEFAULTS.euCountries;
        const regionApiKeyEnv =
          (config.regionApiKeyEnv as Record<string, string>) ??
          DEFAULTS.regionApiKeyEnv;
        const setDisplayName = (key: string, value: string) =>
          setConfig((c) => ({
            ...c,
            displayNames: { ...displayNames, [key]: value },
          }));
        const setEuCountries = (value: string) =>
          setConfig((c) => ({
            ...c,
            euCountries: value
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean),
          }));
        const setRegionEnv = (region: string, envName: string) =>
          setConfig((c) => ({
            ...c,
            regionApiKeyEnv: { ...regionApiKeyEnv, [region]: envName },
          }));
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Sender"
              description="The Resend account, region, and domain used to send transactional email."
            >
              <ToggleField
                value={config.enabled as boolean | undefined}
                onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
                label="Email enabled"
                description="Disable to suppress all transactional emails (sign-in alerts, welcome, etc.)"
              />
              <div>
                <FieldLabel hint="The subdomain that Resend will deliver from.">
                  Region domain
                </FieldLabel>
                <TextField
                  value={config.regionDomain as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, regionDomain: v }))}
                  placeholder="flare-sh.tech"
                />
              </div>
              <div>
                <FieldLabel hint="ISO country code used when no per-region key is set.">
                  Default country
                </FieldLabel>
                <TextField
                  value={config.defaultCountry as string | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, defaultCountry: v.toUpperCase() }))
                  }
                  placeholder="US"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Sender prefixes"
              description="Display name per prefix. Used as `Display <prefix@region.domain>`."
            >
              {(["security", "auth", "noreply", "payments"] as const).map(
                (prefix) => (
                  <div key={prefix}>
                    <FieldLabel>{prefix}@</FieldLabel>
                    <TextField
                      value={displayNames[prefix]}
                      onChange={(v) => setDisplayName(prefix, v)}
                      placeholder={`Flare ${prefix}`}
                    />
                  </div>
                ),
              )}
            </SectionCard>

            <SectionCard
              title="EU countries"
              description="Comma-separated ISO country codes that should be routed to the EU Resend key."
            >
              <TextField
                value={euCountries.join(", ")}
                onChange={setEuCountries}
                placeholder="DE, FR, IT, ES, NL, ..."
              />
            </SectionCard>

            <SectionCard
              title="Region API key env vars"
              description="Map ISO country code -> Resend API key env var name. Add or rename buckets without redeploying."
            >
              {Object.entries(regionApiKeyEnv).map(([region, env]) => (
                <div key={region} className="grid grid-cols-[80px_1fr] gap-3 items-center">
                  <span className="text-sm font-mono text-muted-foreground">
                    {region}
                  </span>
                  <TextField
                    value={env}
                    onChange={(v) => setRegionEnv(region, v)}
                    placeholder="RESEND_API_KEY_..."
                  />
                </div>
              ))}
            </SectionCard>
          </div>
        );
      }}
    />
  );
}
