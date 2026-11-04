export const IS_DEV = process.env.NODE_ENV !== "production";
export const IS_BROWSER = typeof window !== "undefined";

declare const EdgeRuntime: any;
export const IS_EDGE_RUNTIME = typeof EdgeRuntime !== "undefined";

export const PROMPT_PASTE_MAX_LENGTH = 1000;

export const IS_VERCEL_ENV = process.env.VERCEL === "1";
export const IS_DOCKER_ENV = process.env.DOCKER_BUILD === "1";

export const IS_MCP_SERVER_REMOTE_ONLY = IS_VERCEL_ENV;
export const FILE_BASED_MCP_CONFIG =
  process.env.FILE_BASED_MCP_CONFIG === "true";

export const COOKIE_KEY_SIDEBAR_STATE = "sidebar:state";
export const COOKIE_KEY_LOCALE = "i18n:locale";
const normalizeBaseUrl = (value?: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

// Base URL for the application.
// Prefer FLARE_AUTH_URL in production; NEXT_PUBLIC_BASE_URL is accepted as a
// compatibility fallback because other auth routes already use it.
export const BASE_URL = normalizeBaseUrl(
  process.env.FLARE_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL,
);

// Runtime function to get base URL with Vercel fallbacks
export function getBaseUrl(): string {
  const url = [
    process.env.FLARE_AUTH_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.BETTER_AUTH_URL ||
      process.env.AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "",
  ]
    .map(normalizeBaseUrl)
    .find(Boolean);

  return url || "";
}

export function getRequiredBaseUrl(featureName = "OAuth callback"): string {
  const baseUrl = getBaseUrl();
  if (baseUrl) return baseUrl;

  throw new Error(
    `${featureName} URL is not configured. Set FLARE_AUTH_URL to your public HTTPS app URL, for example https://www.flare-ai.com.`,
  );
}

export const BASE_THEMES = [
  "default",
  "zinc",
  "slate",
  "stone",
  "gray",
  "blue",
  "orange",
  "pink",
  "bubblegum-pop",
  "cyberpunk-neon",
  "retro-arcade",
  "tropical-paradise",
  "steampunk-cogs",
  "neon-synthwave",
  "pastel-kawaii",
  "space-odyssey",
  "vintage-vinyl",
  "misty-harbor",
  "zen-garden",
];

export const OAUTH_REQUIRED_CODE = "OAUTH_REQUIRED";

export const SUPPORTED_LOCALES = [
  {
    code: "en",
    name: "English 🇺🇸",
  },
  {
    code: "ko",
    name: "Korean 🇰🇷",
  },

  {
    code: "es",
    name: "Spanish 🇪🇸",
  },
  {
    code: "fr",
    name: "French 🇫🇷",
  },
  {
    code: "ja",
    name: "Japanese 🇯🇵",
  },
  {
    code: "zh",
    name: "Chinese 🇨🇳",
  },
];

export const BACKGROUND_COLORS = [
  "oklch(87% 0 0)",
  "oklch(20.5% 0 0)",
  "oklch(80.8% 0.114 19.571)",
  "oklch(83.7% 0.128 66.29)",
  "oklch(84.5% 0.143 164.978)",
  "oklch(82.8% 0.111 230.318)",
  "oklch(78.5% 0.115 274.713)",
  "oklch(81% 0.117 11.638)",
  "oklch(81% 0.117 11.638)",
];

export const EMOJI_DATA = [
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f604.png",
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f603.png",
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f602.png",
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f601.png",
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f600.png",
];
