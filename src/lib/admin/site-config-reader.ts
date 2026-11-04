import "server-only";
import { siteConfigRepository } from "lib/db/repository";
import {
  buildDefaultBrandingConfig,
  buildDefaultChatConfig,
  buildDefaultCommunityConfig,
  buildDefaultEmailConfig,
  buildDefaultGeneralConfig,
  buildDefaultMcpConfig,
  buildDefaultOAuthConfig,
  buildDefaultSecurityConfig,
  type ConfigKey,
} from "./site-config-defaults";
import logger from "logger";

/**
 * Resolved shape for every admin config section, after applying DB overrides
 * on top of the built-in defaults. Every consumer that wants to read an
 * admin-configurable value should import `getAdminConfig()` from this file
 * instead of touching `siteConfigRepository` directly.
 */
type AdminConfigShape = {
  general: ReturnType<typeof buildDefaultGeneralConfig>;
  email: ReturnType<typeof buildDefaultEmailConfig>;
  branding: ReturnType<typeof buildDefaultBrandingConfig>;
  oauth: ReturnType<typeof buildDefaultOAuthConfig>;
  security: ReturnType<typeof buildDefaultSecurityConfig>;
  mcp: ReturnType<typeof buildDefaultMcpConfig>;
  chat: ReturnType<typeof buildDefaultChatConfig>;
  community: ReturnType<typeof buildDefaultCommunityConfig>;
};

let cache: Partial<Record<ConfigKey, unknown>> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5_000;

async function loadAll(): Promise<Partial<Record<ConfigKey, unknown>>> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const db = await siteConfigRepository.getAll();
    cache = db as Partial<Record<ConfigKey, unknown>>;
  } catch (err) {
    logger.error("[admin-config] failed to load site config:", err);
    cache = {};
  }
  cacheLoadedAt = now;
  return cache;
}

function merge<T extends object>(defaults: T, override: unknown): T {
  if (!override || typeof override !== "object") return { ...defaults };
  // Shallow merge top-level; deep merge for nested objects so adding a new
  // sub-key in defaults is preserved when the DB has only the older shape.
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const existing = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && existing && typeof existing === "object" && !Array.isArray(existing)) {
      out[k] = { ...(existing as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export async function getAdminConfig(): Promise<AdminConfigShape> {
  const all = await loadAll();
  return {
    general: merge(buildDefaultGeneralConfig(), all.general),
    email: merge(buildDefaultEmailConfig(), all.email),
    branding: merge(buildDefaultBrandingConfig(), all.branding),
    oauth: merge(buildDefaultOAuthConfig(), all.oauth),
    security: merge(buildDefaultSecurityConfig(), all.security),
    mcp: merge(buildDefaultMcpConfig(), all.mcp),
    chat: merge(buildDefaultChatConfig(), all.chat),
    community: merge(buildDefaultCommunityConfig(), all.community),
  };
}

export async function getAdminConfigSection<K extends keyof AdminConfigShape>(
  key: K,
): Promise<AdminConfigShape[K]> {
  const all = await getAdminConfig();
  return all[key];
}

/**
 * Force the next read to reload from the database. Call this after a
 * settings POST so subsequent reads in the same process pick up changes.
 */
export function invalidateAdminConfigCache() {
  cache = null;
  cacheLoadedAt = 0;
}
