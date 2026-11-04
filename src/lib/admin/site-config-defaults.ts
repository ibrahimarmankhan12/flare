/**
 * Centralized defaults for every top-level admin config key.
 *
 * The admin panel stores overrides in the `site_config` JSON table under
 * one of the keys in `CONFIG_KEYS`. Each section in this file is the
 * factory that returns the "no override" shape for that key.
 *
 * Every field should be safe to ship as-is to a brand-new deployment
 * and degrade gracefully when the corresponding env var is also absent.
 */
export const CONFIG_KEYS = [
  "models",
  "tools",
  "canvas",
  "artifacts",
  "general",
  "email",
  "branding",
  "oauth",
  "security",
  "mcp",
  "chat",
  "community",
  "payments",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

// ── Email / Resend ──────────────────────────────────────────────────
export const buildDefaultEmailConfig = () => ({
  enabled: true,
  regionDomain: "flare-sh.tech",
  defaultCountry: "US",
  displayNames: {
    security: "Flare Security",
    auth: "Flare",
    noreply: "Flare",
    payments: "Flare Payments",
  },
  senderPrefixes: ["security", "auth", "noreply", "payments"] as const,
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
  // Mapping of ISO country code -> env var name that holds the Resend key.
  // Admins can add new region buckets here without a code deploy.
  regionApiKeyEnv: {
    US: "RESEND_API_KEY_US",
    IN: "RESEND_API_KEY_IN",
    CN: "RESEND_API_KEY_CHIN",
    EU: "RESEND_API_KEY_EU",
    AU: "RESEND_API_KEY_AUSTRALIA",
    SG: "RESEND_API_KEY_SINGAPORE",
    BR: "RESEND_API_KEY_BRAZIL",
  },
});

// ── Branding ────────────────────────────────────────────────────────
export const buildDefaultBrandingConfig = () => ({
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
});

// ── OAuth / Auth providers ─────────────────────────────────────────
// Each provider entry holds:
//   - enabled: whether the provider is offered at all (sign-in AND/OR connector)
//   - clientId / clientSecret: optional admin-provided OAuth credentials. When
//     empty, the runtime falls back to the corresponding env vars
//     (GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID, etc.). Setting them here is the
//     preferred path for self-hosted admins who don't want to redeploy to
//     rotate secrets.
//   - forceAccountSelection / tenantId: sign-in-time behavior knobs.
// The `clientSecret` field is treated as opaque by the API route and the
// `site_config` table — it is not displayed back to the user after save.
export const buildDefaultOAuthConfig = () => ({
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
});

// ── Security ────────────────────────────────────────────────────────
export const buildDefaultSecurityConfig = () => ({
  sessionExpiresInSeconds: 60 * 60 * 24,
  sessionUpdateAgeSeconds: 60 * 60 * 24,
  sessionCookieCacheMaxAgeSeconds: 60 * 60 * 24,
  ipHeaderPriority: [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
  ] as string[],
  geoHeaderPriority: [
    "cf-ipcountry",
    "cf-ipcity",
    "x-vercel-ip-country",
  ] as string[],
  securityEventsLookback: 50,
  headers: {
    xFrameOptions: "SAMEORIGIN",
    contentSecurityPolicy: "frame-ancestors 'self';",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    permissionsPolicy: "camera=(), microphone=(self), geolocation=()",
  },
});

// ── MCP ─────────────────────────────────────────────────────────────
export const buildDefaultMcpConfig = () => ({
  // IDs of servers from the public/featured pool that the dashboard
  // should surface under the "Featured MCP servers" section. Empty means
  // "fall back to the first 6 featured servers returned by the API".
  featuredServerIds: [] as string[],
  // When true, OAuth-requiring servers can be saved before authorization
  // is completed. Disabling enforces a stricter preview-only experience.
  allowPreAuthSave: true,
  // Maximum number of seconds to wait for an MCP server connection test
  // before marking it failed.
  connectionTestTimeoutSeconds: 15,
  // Cooldown in seconds between repeated MCP server sync attempts.
  syncCooldownSeconds: 30,
});

// ── Chat defaults ──────────────────────────────────────────────────
export const buildDefaultChatConfig = () => ({
  // "Gemini 3 Flash" is a registered name in the static model registry
  // (`staticModels.google["Gemini 3 Flash"]`) and is also used as the
  // runtime fallback for any unrecognized chatModel — see `resolveModel`
  // / `resolveFallbackModel` in `src/lib/ai/models.ts`.
  defaultModel: "Gemini 3 Flash",
  defaultTheme: "system" as "light" | "dark" | "system",
  defaultLocale: "en",
  defaultSidebarCollapsed: false,
  // Headings + prompts shown on the empty chat surface.
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
  // Per-user agent/tool guards.
  maxAgentsPerUser: 25,
  maxToolsPerAgent: 30,
  maxThreadsPerUser: 500,
  // Soft cap on the number of characters the prompt input will accept.
  promptPasteMaxLength: 1000,
});

// ── Community ──────────────────────────────────────────────────────
export const buildDefaultCommunityConfig = () => ({
  enabled: true,
  allowAnonymousPosts: true,
  maxPostLength: 4000,
  maxTagsPerPost: 8,
  maxMediaPerPost: 1,
  allowedMediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  maxMediaSizeMB: 8,
  // Allowed feed tabs the client surfaces. Order is preserved.
  feedTabs: ["For You", "Trending", "Latest", "Following"] as string[],
  // When true, the community page shows up in the chat sidebar nav.
  showInSidebar: true,
});

// ── General (kept here so the route file stays small) ───────────────
export const buildDefaultGeneralConfig = () => ({
  appName: "Flare AI",
  appLogoUrl: "/flare-logo-512.webp",
  defaultToolChoice: "auto" as "auto" | "none" | "manual",
  freeTierDailyTokenLimit: 150000,
  freeTierEnabled: true,
  freeTierDailyImageGenerations: 5,
  freeTierDailyImageEdits: 2,
  rateLimitPerUser: 60,
  rateLimitPerIP: 120,
  rateLimitWindowSeconds: 60,
  featureFlags: {
    newCanvas: true,
    voiceChat: true,
    communityPage: true,
    experimentalAgents: false,
  },
});

// ── Payments (Dodo) ────────────────────────────────────────────────
// Mirrors the DODO_* env vars. The runtime prefers the env var when
// set and falls back to whatever the admin saved here. Secrets
// (apiKey, webhookSecret) are stored encrypted in
// `site_config.tools.apiKeysSecrets`; only the *presence* of a
// configured value is reflected in this section.
export const buildDefaultPaymentsConfig = () => ({
  dodo: {
    enabled: true,
    environment: "test_mode" as "test_mode" | "live_mode",
    productIds: {
      "flare-pro": "",
      "flare-max": "",
      "flare-enterprises": "",
      "flare-enterprises-pro": "",
      "flare-enterprises-max": "",
    },
  },
});
