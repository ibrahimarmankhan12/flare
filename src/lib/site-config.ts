import "server-only";
import { customModelProvider } from "lib/ai/models";
import { siteConfigRepository } from "lib/db/repository";

let cachedConfig: {
  config: RuntimeSiteConfig | null;
  fetchedAt: number;
} | null = null;

const CACHE_TTL_MS = 30_000; // 30s

export interface RuntimeSiteConfig {
  models: {
    enabledProviders: Set<string>;
    defaultModels: Record<string, string>;
    fallbackRouting: Record<string, string>;
  };
  tools: {
    enabledCategories: Set<string>;
    enabledTools: Set<string>;
  };
  canvas: {
    model: string;
    defaultSlideCount: number;
    pptxExportEnabled: boolean;
  };
  artifacts: {
    model: string;
    enabledTypes: string[];
  };
  general: {
    appName: string;
    appLogoUrl: string;
    defaultToolChoice: "auto" | "none" | "manual";
    freeTierDailyTokenLimit: number;
    freeTierEnabled: boolean;
  };
}

function buildRuntimeConfig(): RuntimeSiteConfig {
  const defaultProviders = new Set(
    customModelProvider.modelsInfo.map((p) => p.provider),
  );

  return {
    models: {
      enabledProviders: defaultProviders,
      defaultModels: {},
      fallbackRouting: {},
    },
    tools: {
      enabledCategories: new Set([
        "Visualization",
        "WebSearch",
        "Browser",
        "Code",
        "Video",
        "Artifacts",
        "Canvas",
        "Connectors",
        "Memory",
      ]),
      enabledTools: new Set(),
    },
    canvas: {
      model: "Claude Opus 4.6",
      defaultSlideCount: 10,
      pptxExportEnabled: true,
    },
    artifacts: {
      model: "Claude Opus 4.6",
      enabledTypes: ["html", "react", "slides"],
    },
    general: {
      appName: "Flare AI",
      appLogoUrl: "/flare-logo-512.webp",
      defaultToolChoice: "auto",
      freeTierDailyTokenLimit: 150_000,
      freeTierEnabled: true,
    },
  };
}

function mergeDbOverrides(
  config: RuntimeSiteConfig,
  dbSettings: Record<string, unknown>,
): RuntimeSiteConfig {
  // Models
  const dbModels = dbSettings.models as Record<string, unknown> | undefined;
  if (dbModels) {
    if (dbModels.enabledProviders) {
      config.models.enabledProviders = new Set(
        dbModels.enabledProviders as string[],
      );
    }
    if (dbModels.defaultModels) {
      config.models.defaultModels = dbModels.defaultModels as Record<
        string,
        string
      >;
    }
    if (dbModels.fallbackRouting) {
      config.models.fallbackRouting = dbModels.fallbackRouting as Record<
        string,
        string
      >;
    }
  }

  // Tools
  const dbTools = dbSettings.tools as Record<string, unknown> | undefined;
  if (dbTools) {
    if (dbTools.enabledToolCategories) {
      config.tools.enabledCategories = new Set(
        dbTools.enabledToolCategories as string[],
      );
    }
    if (dbTools.enabledTools) {
      config.tools.enabledTools = new Set(dbTools.enabledTools as string[]);
    }
  }

  // Canvas
  const dbCanvas = dbSettings.canvas as Record<string, unknown> | undefined;
  if (dbCanvas) {
    if (dbCanvas.canvasModel)
      config.canvas.model = dbCanvas.canvasModel as string;
    if (typeof dbCanvas.defaultSlideCount === "number") {
      config.canvas.defaultSlideCount = dbCanvas.defaultSlideCount;
    }
    if (typeof dbCanvas.pptxExportEnabled === "boolean") {
      config.canvas.pptxExportEnabled = dbCanvas.pptxExportEnabled;
    }
  }

  // Artifacts
  const dbArtifacts = dbSettings.artifacts as
    | Record<string, unknown>
    | undefined;
  if (dbArtifacts) {
    if (dbArtifacts.artifactModel) {
      config.artifacts.model = dbArtifacts.artifactModel as string;
    }
    if (Array.isArray(dbArtifacts.enabledTypes)) {
      config.artifacts.enabledTypes = dbArtifacts.enabledTypes as string[];
    }
  }

  // General
  const dbGeneral = dbSettings.general as Record<string, unknown> | undefined;
  if (dbGeneral) {
    if (dbGeneral.appName) config.general.appName = dbGeneral.appName as string;
    if (dbGeneral.appLogoUrl)
      config.general.appLogoUrl = dbGeneral.appLogoUrl as string;
    if (dbGeneral.defaultToolChoice) {
      const tc = dbGeneral.defaultToolChoice as string;
      if (tc === "auto" || tc === "none" || tc === "manual") {
        config.general.defaultToolChoice = tc;
      }
    }
    if (typeof dbGeneral.freeTierDailyTokenLimit === "number") {
      config.general.freeTierDailyTokenLimit =
        dbGeneral.freeTierDailyTokenLimit;
    }
    if (typeof dbGeneral.freeTierEnabled === "boolean") {
      config.general.freeTierEnabled = dbGeneral.freeTierEnabled;
    }
  }

  return config;
}

export async function getRuntimeSiteConfig(): Promise<RuntimeSiteConfig> {
  const now = Date.now();

  if (cachedConfig && now - cachedConfig.fetchedAt < CACHE_TTL_MS) {
    return cachedConfig.config!;
  }

  try {
    const dbSettings = await siteConfigRepository.getAll();
    const base = buildRuntimeConfig();
    const config = mergeDbOverrides(base, dbSettings);
    cachedConfig = { config, fetchedAt: now };
    return config;
  } catch {
    // Fall back to defaults if DB is unavailable
    if (cachedConfig?.config) return cachedConfig.config;
    const defaults = buildRuntimeConfig();
    cachedConfig = { config: defaults, fetchedAt: now };
    return defaults;
  }
}

export function invalidateSiteConfigCache(): void {
  cachedConfig = null;
}
