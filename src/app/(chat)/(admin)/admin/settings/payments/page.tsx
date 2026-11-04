"use client";

import { CreditCard } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  ToggleField,
  SectionCard,
  SelectField,
} from "@/components/admin/ui/form-fields";

const PAID_TIERS: Array<{
  slug: string;
  label: string;
  envVar: string;
}> = [
  { slug: "flare-pro", label: "Flare Pro", envVar: "DODO_PRODUCT_FLARE_PRO" },
  { slug: "flare-max", label: "Flare Max", envVar: "DODO_PRODUCT_FLARE_MAX" },
  {
    slug: "flare-enterprises",
    label: "Flare Enterprises",
    envVar: "DODO_PRODUCT_FLARE_ENTERPRISES",
  },
  {
    slug: "flare-enterprises-pro",
    label: "Flare Enterprises Pro",
    envVar: "DODO_PRODUCT_FLARE_ENTERPRISES_PRO",
  },
  {
    slug: "flare-enterprises-max",
    label: "Flare Enterprises Max",
    envVar: "DODO_PRODUCT_FLARE_ENTERPRISES_MAX",
  },
];

const DEFAULTS = {
  dodo: {
    enabled: true,
    environment: "test_mode" as "test_mode" | "live_mode",
    productIds: PAID_TIERS.reduce<Record<string, string>>(
      (acc, t) => ({ ...acc, [t.slug]: "" }),
      {},
    ),
  },
};

export default function PaymentsPage() {
  return (
    <AdminSettingsPage
      icon={<CreditCard className="size-6 text-muted-foreground" />}
      title="Payments"
      description="Dodo Payments credentials, environment, and tier -> product id mapping used for self-service plan upgrades."
      configKey="payments"
      defaults={DEFAULTS as unknown as Record<string, unknown>}
      renderForm={({ config, setConfig }) => {
        const dodo =
          (config.dodo as
            | {
                enabled?: boolean;
                environment?: "test_mode" | "live_mode";
                productIds?: Record<string, string>;
              }
            | undefined) ?? DEFAULTS.dodo;
        const productIds = dodo.productIds ?? {};
        const setProductId = (slug: string, value: string) => {
          setConfig((c) => ({
            ...c,
            dodo: {
              ...((c.dodo as object) ?? {}),
              productIds: {
                ...((c.dodo as { productIds?: Record<string, string> })?.productIds ??
                  {}),
                [slug]: value,
              },
            },
          }));
        };
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Dodo Payments"
              description="API key, webhook secret, and product IDs are also editable on the API Keys page. The env var always wins when set; values saved here act as a fallback."
            >
              <ToggleField
                value={dodo.enabled ?? true}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    dodo: { ...((c.dodo as object) ?? {}), enabled: v },
                  }))
                }
                label="Self-service upgrades enabled"
                description="When disabled, the Dodo upgrade card hides and users must request a plan change through an admin."
              />
              <div>
                <FieldLabel hint="test_mode uses https://test.dodopayments.com; live_mode uses the live URL. Env var DODO_ENVIRONMENT wins when set.">
                  Environment
                </FieldLabel>
                <SelectField
                  value={dodo.environment ?? "test_mode"}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      dodo: {
                        ...((c.dodo as object) ?? {}),
                        environment: v as "test_mode" | "live_mode",
                      },
                    }))
                  }
                  options={[
                    { value: "test_mode", label: "Test mode" },
                    { value: "live_mode", label: "Live mode" },
                  ]}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="API keys & webhook secret"
              description="Set the DODO_PAYMENTS_API_KEY and DODO_WEBHOOK_SECRET from the API Keys page. They are stored encrypted in site_config."
            >
              <p className="text-sm text-muted-foreground">
                Open{" "}
                <a
                  href="/admin/api-keys"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Admin → API Keys
                </a>{" "}
                to edit <code>Dodo Payments (API Key)</code> and{" "}
                <code>Dodo Payments (Webhook Secret)</code>. Removing the env
                var on the server is required before the dashboard can manage
                an already-env-set key.
              </p>
            </SectionCard>

            <SectionCard
              title="Tier -> product ID"
              description="Paste the Dodo product ID for each paid tier. Leave empty to fall back to the env var (or to grey the tier out in the upgrade card)."
            >
              {PAID_TIERS.map((t) => (
                <div key={t.slug} className="grid grid-cols-[140px_1fr] gap-3 items-center">
                  <span className="text-sm font-mono text-muted-foreground">
                    {t.label}
                  </span>
                  <TextField
                    value={productIds[t.slug] ?? ""}
                    onChange={(v) => setProductId(t.slug, v)}
                    placeholder={t.envVar}
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
