import "server-only";
import { NextResponse } from "next/server";
import { siteConfigRepository } from "lib/db/repository";
import { requireAdminPermission } from "lib/auth/permissions";
import { customModelProvider, setAdminFallbackChain } from "lib/ai/models";
import { getSession } from "lib/auth/server";
import {
  CONFIG_KEYS,
  buildDefaultBrandingConfig,
  buildDefaultChatConfig,
  buildDefaultCommunityConfig,
  buildDefaultEmailConfig,
  buildDefaultGeneralConfig,
  buildDefaultMcpConfig,
  buildDefaultOAuthConfig,
  buildDefaultPaymentsConfig,
  buildDefaultSecurityConfig,
} from "lib/admin/site-config-defaults";
import { invalidateAdminConfigCache } from "lib/admin/site-config-reader";

// KEYS is derived from the shared defaults list so new admin sections
// automatically become writable through this route.
const KEYS = CONFIG_KEYS;

function buildDefaultModelsConfig() {
  const info = customModelProvider.modelsInfo;
  return {
    providers: Object.fromEntries(
      info.map((p) => {
        // All providers are enabled in the UI so users can browse all model names.
        // The backend routes every model through Flare (see resolveModel in models.ts).
        const firstModel = p.models[0]?.name ?? "";
        return [
          p.provider,
          {
            enabled: true,
            apiKeyConfigured: p.hasAPIKey,
            defaultModel: firstModel,
            fallbackChain: [
              { provider: "flare", model: p.models[1]?.name ?? firstModel },
            ],
            isDynamic: false,
          },
        ];
      }),
    ),
  };
}

function buildDefaultToolsConfig() {
  return {
    categories: {
      Visualization: { enabled: true, tools: {} },
      WebSearch: { enabled: true, tools: {} },
      Browser: { enabled: true, tools: {} },
      Code: { enabled: true, tools: {} },
      Video: { enabled: true, tools: {} },
      Artifacts: { enabled: true, tools: {} },
      Canvas: { enabled: true, tools: {} },
      Connectors: { enabled: true, tools: {} },
      Memory: { enabled: true, tools: {} },
    },
    apiKeys: {
      exa: !!process.env.EXA_API_KEY,
      firecrawl: !!process.env.FIRECRAWL_API_KEY,
      youtube: !!process.env.YOUTUBE_API_KEY,
      supadata: !!process.env.SUPADATA_API_KEY,
      konvo: !!process.env.KONVO_AI_API,
    },
  };
}

export async function GET(req: Request) {
  try {
    await requireAdminPermission("access admin configuration");
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const db = await siteConfigRepository.getAll();

    // Build static providers from defaults, then apply DB overrides per-provider
    const staticDefaults = buildDefaultModelsConfig();
    const dbModels = db.models ?? {};
    const dbProviders = dbModels.providers ?? {};

    // Merge DB provider overrides into static defaults (per-provider spread, not top-level)
    // Also migrate old "fallbackModel" string to new "fallbackChain" array format
    const mergedProviders: Record<string, unknown> = {};
    for (const [provider, defaultInfo] of Object.entries(
      staticDefaults.providers,
    )) {
      const dbInfo = dbProviders[provider] ?? {};
      // Migrate legacy fallbackModel string to fallbackChain array
      if (dbInfo.fallbackModel && !dbInfo.fallbackChain) {
        const parts = (dbInfo.fallbackModel as string).split("/");
        if (parts.length >= 2 && parts[0] && parts[1]) {
          dbInfo.fallbackChain = [
            { provider: parts[0], model: parts.slice(1).join("/") },
          ];
        } else {
          dbInfo.fallbackChain = [];
        }
        delete dbInfo.fallbackModel;
      }
      mergedProviders[provider] = { ...defaultInfo, ...dbInfo };
    }

    // Merge in dynamic providers from DB config
    const dbDynamicProviders = dbModels.dynamicProviders ?? {};
    for (const [key, dynProvider] of Object.entries(dbDynamicProviders) as [
      string,
      any,
    ][]) {
      mergedProviders[key] = {
        enabled: dynProvider.enabled ?? false,
        apiKeyConfigured: !!(dynProvider.apiKey || dynProvider.baseURL),
        defaultModel: "",
        fallbackChain: [],
        isDynamic: true,
        baseURL: dynProvider.baseURL ?? "",
        models: dynProvider.models ?? [],
        name: dynProvider.name ?? key,
      };
    }

    const modelsConfig = {
      providers: mergedProviders,
      ...(dbModels.globalFallback
        ? { globalFallback: dbModels.globalFallback }
        : {}),
    };

    // Sync admin fallback chains into the runtime model registry on each config read
    if (dbModels.providers) {
      for (const [provider, info] of Object.entries(
        dbModels.providers as Record<
          string,
          { fallbackChain?: { provider: string; model: string }[] }
        >,
      )) {
        setAdminFallbackChain(provider, info.fallbackChain ?? []);
      }
    }

    // Export: return full config JSON (without masking)
    if (action === "export") {
      const config = {
        exportedAt: new Date().toISOString(),
        version: "1",
        models: modelsConfig,
        tools: { ...buildDefaultToolsConfig(), ...(db.tools ?? {}) },
        canvas: {
          model: "Claude Opus 4.6",
          defaultSlideCount: 10,
          pptxExportEnabled: true,
          ...(db.canvas ?? {}),
        },
        artifacts: {
          model: "Gemini 3 Flash",
          enabledTypes: ["html", "react", "slides"],
          ...(db.artifacts ?? {}),
        },
        general: { ...buildDefaultGeneralConfig(), ...(db.general ?? {}) },
        email: { ...buildDefaultEmailConfig(), ...(db.email ?? {}) },
        branding: { ...buildDefaultBrandingConfig(), ...(db.branding ?? {}) },
        oauth: { ...buildDefaultOAuthConfig(), ...(db.oauth ?? {}) },
        security: { ...buildDefaultSecurityConfig(), ...(db.security ?? {}) },
        mcp: { ...buildDefaultMcpConfig(), ...(db.mcp ?? {}) },
        chat: { ...buildDefaultChatConfig(), ...(db.chat ?? {}) },
        community: {
          ...buildDefaultCommunityConfig(),
          ...(db.community ?? {}),
        },
        payments: {
          ...buildDefaultPaymentsConfig(),
          ...(db.payments ?? {}),
        },
      };
      return NextResponse.json({ success: true, config });
    }

    // Default: return config
    const config = {
      models: modelsConfig,
      tools: { ...buildDefaultToolsConfig(), ...(db.tools ?? {}) },
      canvas: {
        model: "Claude Opus 4.6",
        defaultSlideCount: 10,
        pptxExportEnabled: true,
        ...(db.canvas ?? {}),
      },
      artifacts: {
        model: "Gemini 3 Flash",
        enabledTypes: ["html", "react", "slides"],
        ...(db.artifacts ?? {}),
      },
      general: { ...buildDefaultGeneralConfig(), ...(db.general ?? {}) },
      email: { ...buildDefaultEmailConfig(), ...(db.email ?? {}) },
      branding: { ...buildDefaultBrandingConfig(), ...(db.branding ?? {}) },
      oauth: { ...buildDefaultOAuthConfig(), ...(db.oauth ?? {}) },
      security: { ...buildDefaultSecurityConfig(), ...(db.security ?? {}) },
      mcp: { ...buildDefaultMcpConfig(), ...(db.mcp ?? {}) },
      chat: { ...buildDefaultChatConfig(), ...(db.chat ?? {}) },
      community: {
        ...buildDefaultCommunityConfig(),
        ...(db.community ?? {}),
      },
      payments: {
        ...buildDefaultPaymentsConfig(),
        ...(db.payments ?? {}),
      },
    };
    return NextResponse.json({ success: true, config });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (
      msg.includes("permission") ||
      msg.includes("unauthorized") ||
      msg.includes("admin")
    ) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }
    console.error("Config load error", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminPermission("update admin configuration");
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Import: accept full config JSON
    if (action === "import") {
      try {
        const session = await getSession();
        const userId = session?.user?.id ?? "unknown";
        const { config } = await req.json();
        if (!config || typeof config !== "object") {
          return NextResponse.json(
            { success: false, error: "Invalid config object" },
            { status: 400 },
          );
        }
        let count = 0;
        for (const key of KEYS) {
          if (config[key] !== undefined) {
            await siteConfigRepository.upsert(
              key,
              config[key],
              userId,
              "update",
            );
            count++;
          }
        }
        invalidateAdminConfigCache();
        return NextResponse.json({ success: true, imported: count });
      } catch (err: any) {
        console.error("[config/POST import] error:", err);
        return NextResponse.json(
          {
            success: false,
            error: String(err && err.message ? err.message : "import failed"),
          },
          { status: 500 },
        );
      }
    }

    // Default: update single section
    const session = await getSession();
    const userId = session?.user?.id ?? "unknown";
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const { key, settings } = body;
    if (!KEYS.includes(key)) {
      return NextResponse.json(
        { success: false, error: "Invalid key" },
        { status: 400 },
      );
    }
    try {
      await siteConfigRepository.upsert(key, settings ?? {}, userId);
      invalidateAdminConfigCache();

      // Sync admin fallback chains into the runtime model registry
      if (key === "models" && settings?.providers) {
        for (const [provider, info] of Object.entries(
          settings.providers as Record<
            string,
            { fallbackChain?: { provider: string; model: string }[] }
          >,
        )) {
          setAdminFallbackChain(provider, info.fallbackChain ?? []);
        }
      }

      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error("[config/POST] upsert error:", err);
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to save: " +
            String(err && err.message ? err.message : "unknown"),
        },
        { status: 500 },
      );
    }
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    if (
      msg.includes("permission") ||
      msg.includes("unauthorized") ||
      msg.includes("admin")
    ) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }
    console.error("[config/POST] outer error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
