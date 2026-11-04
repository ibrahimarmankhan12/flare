import "server-only";
import { siteConfigRepository } from "lib/db/repository";
import { ALL_TOOLKIT_CATEGORY_KEYS } from "lib/ai/tools/toolkit-catalog";

const CACHE_TTL_MS = 30_000;

interface SiteConfigCache {
  tools: {
    enabledCategories: Set<string>;
  };
  models: {
    enabledProviders: Set<string>;
    defaultModels: Record<string, string>;
    fallbackRouting: Record<string, string>;
  };
  fetchedAt: number;
}

let _cache: SiteConfigCache | null = null;

// Derived from the toolkit catalog so a new toolkit is never silently
// unreachable. A category missing from here (or from the site config
// row) is treated as disabled and its tools never reach the model.
const ALL_CATEGORIES = new Set(ALL_TOOLKIT_CATEGORY_KEYS);

const ALL_PROVIDERS = new Set([
  "google",
  "groq",
  "perplexity",
  "anthropic",
  "openai",
  "Qwen",
  "KonvO AI",
  "Nvidia",
  "Deepseek",
  "Moonshot",
  "MiniMax",
  "zAI",
  "flare",
]);

const DEFAULT_CACHE: SiteConfigCache = {
  tools: { enabledCategories: new Set(ALL_CATEGORIES) },
  models: {
    enabledProviders: new Set(ALL_PROVIDERS),
    defaultModels: {},
    fallbackRouting: {},
  },
  fetchedAt: 0,
};

function buildCache(
  dbSettings: Record<string, Record<string, unknown>>,
): SiteConfigCache {
  const tools = { enabledCategories: new Set(ALL_CATEGORIES) };
  const models = {
    enabledProviders: new Set(ALL_PROVIDERS),
    defaultModels: {} as Record<string, string>,
    fallbackRouting: {} as Record<string, string>,
  };

  const toolsCfg = dbSettings.tools;
  if (toolsCfg) {
    const cats = toolsCfg.categories as
      | Record<string, { enabled: boolean }>
      | undefined;
    if (cats) {
      tools.enabledCategories = new Set(
        Object.entries(cats)
          .filter(([, v]) => v.enabled)
          .map(([k]) => k.toLowerCase()),
      );
    }
  }

  const modelsCfg = dbSettings.models;
  if (modelsCfg) {
    if (
      modelsCfg.enabledProviders &&
      Array.isArray(modelsCfg.enabledProviders)
    ) {
      models.enabledProviders = new Set(
        (modelsCfg.enabledProviders as string[]).map((p) => p.toLowerCase()),
      );
    }
    if (modelsCfg.defaultModels) {
      models.defaultModels = modelsCfg.defaultModels as Record<string, string>;
    }
    if (modelsCfg.fallbackRouting) {
      models.fallbackRouting = modelsCfg.fallbackRouting as Record<
        string,
        string
      >;
    }
  }

  return { tools, models, fetchedAt: Date.now() };
}

export async function getSiteConfig(): Promise<SiteConfigCache> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const dbSettings = await siteConfigRepository.getAll();
    _cache = buildCache(dbSettings);
  } catch {
    if (!_cache) _cache = DEFAULT_CACHE;
  }

  return _cache!;
}

export function getCachedConfig(): SiteConfigCache {
  return _cache ?? DEFAULT_CACHE;
}

export async function getEnabledCategories(): Promise<Set<string>> {
  return (await getSiteConfig()).tools.enabledCategories;
}

export async function getEnabledProviders(): Promise<Set<string>> {
  return (await getSiteConfig()).models.enabledProviders;
}

export function invalidateSiteConfigCache(): void {
  _cache = null;
}
