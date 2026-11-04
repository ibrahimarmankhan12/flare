"use client";

import { Shield } from "lucide-react";
import { AdminSettingsPage } from "@/components/admin/ui/admin-settings-page";
import {
  FieldLabel,
  TextField,
  NumberField,
  SectionCard,
} from "@/components/admin/ui/form-fields";

const DEFAULTS = {
  sessionExpiresInSeconds: 60 * 60 * 24,
  sessionUpdateAgeSeconds: 60 * 60 * 24,
  sessionCookieCacheMaxAgeSeconds: 60 * 60 * 24,
  ipHeaderPriority: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"],
  geoHeaderPriority: ["cf-ipcountry", "cf-ipcity", "x-vercel-ip-country"],
  securityEventsLookback: 50,
  headers: {
    xFrameOptions: "SAMEORIGIN",
    contentSecurityPolicy: "frame-ancestors 'self';",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    permissionsPolicy: "camera=(), microphone=(self), geolocation=()",
  },
};

export default function SecurityPage() {
  return (
    <AdminSettingsPage
      icon={<Shield className="size-6 text-muted-foreground" />}
      title="Security"
      description="Session lifetimes, IP / geo header priority, and HTTP security headers."
      configKey="security"
      defaults={DEFAULTS}
      renderForm={({ config, setConfig }) => {
        const headers =
          (config.headers as Record<string, string>) ?? DEFAULTS.headers;
        const ipHeaderPriority =
          (config.ipHeaderPriority as string[]) ??
          DEFAULTS.ipHeaderPriority;
        const geoHeaderPriority =
          (config.geoHeaderPriority as string[]) ??
          DEFAULTS.geoHeaderPriority;
        const setHeader = (key: string, value: string) =>
          setConfig((c) => ({ ...c, headers: { ...headers, [key]: value } }));
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title="Sessions"
              description="Auth session durations. Env vars AUTH_SESSION_EXPIRES_IN_SECONDS, etc. still take precedence on the server."
            >
              <div>
                <FieldLabel hint="When the auth session expires.">
                  Session expires in (seconds)
                </FieldLabel>
                <NumberField
                  value={config.sessionExpiresInSeconds as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, sessionExpiresInSeconds: v }))
                  }
                  min={60}
                />
              </div>
              <div>
                <FieldLabel hint="When the session is refreshed on activity.">
                  Session update age (seconds)
                </FieldLabel>
                <NumberField
                  value={config.sessionUpdateAgeSeconds as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, sessionUpdateAgeSeconds: v }))
                  }
                  min={60}
                />
              </div>
              <div>
                <FieldLabel hint="Max age for the session cookie cache.">
                  Cookie cache max age (seconds)
                </FieldLabel>
                <NumberField
                  value={
                    config.sessionCookieCacheMaxAgeSeconds as number | undefined
                  }
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      sessionCookieCacheMaxAgeSeconds: v,
                    }))
                  }
                  min={60}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Request metadata"
              description="Header priority for extracting the real client IP and geo."
            >
              <div>
                <FieldLabel hint="Comma-separated header names, in priority order.">
                  IP header priority
                </FieldLabel>
                <TextField
                  value={ipHeaderPriority.join(", ")}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      ipHeaderPriority: v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel hint="Comma-separated header names for country / city.">
                  Geo header priority
                </FieldLabel>
                <TextField
                  value={geoHeaderPriority.join(", ")}
                  onChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      geoHeaderPriority: v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel hint="Recent security events to compare for new-device detection.">
                  Security events lookback
                </FieldLabel>
                <NumberField
                  value={config.securityEventsLookback as number | undefined}
                  onChange={(v) =>
                    setConfig((c) => ({ ...c, securityEventsLookback: v }))
                  }
                  min={1}
                  max={500}
                />
              </div>
            </SectionCard>

            <div className="lg:col-span-2 border rounded-xl bg-card p-5 space-y-5 max-w-2xl">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                HTTP headers
              </h2>
              <p className="text-xs text-muted-foreground -mt-3">
                Sent on every response via next.config.ts. Edit values and
                rebuild for changes to take effect.
              </p>
              {[
                ["xFrameOptions", "X-Frame-Options"],
                ["contentSecurityPolicy", "Content-Security-Policy"],
                ["xContentTypeOptions", "X-Content-Type-Options"],
                ["referrerPolicy", "Referrer-Policy"],
                ["strictTransportSecurity", "Strict-Transport-Security"],
                ["permissionsPolicy", "Permissions-Policy"],
              ].map(([key, label]) => (
                <div key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <TextField
                    value={headers[key] ?? ""}
                    onChange={(v) => setHeader(key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }}
    />
  );
}
