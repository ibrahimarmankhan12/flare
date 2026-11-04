"use client";

import { Palette } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  TextAreaField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

const DEFAULTS = {
  appName: "Flare AI",
  appLogoUrl: "/flare-logo-512.webp",
  faviconUrl: "/favicon.ico",
  appleTouchIconUrl: "/flare-logo-192.webp",
  ogImageUrl: "/flare-logo-512.webp",
  tagline: "Build, search, and ship with the world's models in one chat.",
  themeColor: "#000000",
  socialLinks: {
    twitter: "",
    github: "",
    discord: "",
    linkedin: "",
    youtube: "",
  },
};

export default function BrandingPage() {
  return (
    <AdminSettingsPage
      icon={<Palette className="size-6 text-muted-foreground" />}
      title="Branding"
      description="App identity, logos, social cards, and social links shown in the public site."
      configKey="branding"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const socialLinks =
          (config.socialLinks as Record<string, string>) ??
          DEFAULTS.socialLinks;
        const setSocial = (key: string, value: string) =>
          setConfig((c) => ({
            ...c,
            socialLinks: { ...socialLinks, [key]: value },
          }));
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Identity"
              description="The public name and tagline of the product."
            >
              <div>
                <FieldLabel>App name</FieldLabel>
                <TextField
                  value={config.appName as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, appName: v }))}
                />
              </div>
              <div>
                <FieldLabel>Tagline</FieldLabel>
                <TextAreaField
                  value={config.tagline as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, tagline: v }))}
                  rows={2}
                />
              </div>
              <div>
                <FieldLabel>Theme color</FieldLabel>
                <TextField
                  value={config.themeColor as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, themeColor: v }))}
                  placeholder="#000000"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Logos & icons"
              description="Static assets used in the browser tab, share previews, and PWA install screens."
            >
              <div>
                <FieldLabel>App logo URL</FieldLabel>
                <TextField
                  value={config.appLogoUrl as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, appLogoUrl: v }))}
                />
              </div>
              <div>
                <FieldLabel>Favicon URL</FieldLabel>
                <TextField
                  value={config.faviconUrl as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, faviconUrl: v }))}
                />
              </div>
              <div>
                <FieldLabel>Apple touch icon URL</FieldLabel>
                <TextField
                  value={config.appleTouchIconUrl as string | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, appleTouchIconUrl: v }))
                  }
                />
              </div>
              <div>
                <FieldLabel>OG image URL</FieldLabel>
                <TextField
                  value={config.ogImageUrl as string | undefined}
                  onChange={(v) => setConfig((c) => ({ ...c, ogImageUrl: v }))}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Social links"
              description="Full URLs to the public profiles. Leave empty to hide."
            >
              {(
                ["twitter", "github", "discord", "linkedin", "youtube"] as const
              ).map((key) => (
                <div key={key}>
                  <FieldLabel>{key}</FieldLabel>
                  <TextField
                    value={socialLinks[key] ?? ""}
                    onChange={(v) => setSocial(key, v)}
                    placeholder={`https://${key}.com/...`}
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
