import "server-only";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { decrypt } from "lib/security/encryption";

interface ProviderTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

type ProviderConfig = {
  baseURL: string;
  authHeader: string;
  authKey: string;
  headers?: Record<string, string>;
};

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  flare: {
    baseURL: "https://api.flare-sh.tech/v1",
    authHeader: "Authorization",
    authKey: process.env.FLARE_API_KEY || process.env.KORE_API_KEY || "",
    headers: {
      Origin: process.env.FLARE_ORIGIN || "https://api.flare-sh.tech",
    },
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    authHeader: "Authorization",
    authKey: process.env.GROQ_API_KEY || "",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    authHeader: "Authorization",
    authKey: process.env.OPENAI_API_KEY || "",
  },
  anthropic: {
    baseURL: "https://api.anthropic.com/v1",
    authHeader: "x-api-key",
    authKey: process.env.ANTHROPIC_API_KEY || "",
    headers: {
      "anthropic-version": "2023-06-01",
    },
  },
  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    authHeader: "x-goog-api-key",
    authKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    authHeader: "Authorization",
    authKey: process.env.OPENROUTER_API_KEY || "",
  },
  xai: {
    baseURL: "https://api.x.ai/v1",
    authHeader: "Authorization",
    authKey: process.env.XAI_API_KEY || "",
  },
  "z-ai": {
    baseURL: process.env.ZAI_BASE_URL || "https://api.z-ai.io/v1",
    authHeader: "Authorization",
    authKey: process.env.ZAI_API_KEY || "",
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    authHeader: "Authorization",
    authKey: process.env.OLLAMA_API_KEY || "",
  },
};

async function getDynamicProviderConfig(
  providerId: string,
): Promise<ProviderConfig | null> {
  try {
    const modelsConfig = await siteConfigRepository.getConfig("models");
    const dynamicProviders = modelsConfig?.dynamicProviders as
      | Record<string, { baseURL: string; apiKey: string }>
      | undefined;

    const provider = dynamicProviders?.[providerId];
    if (!provider) return null;

    const toolsConfig = await siteConfigRepository.getConfig("tools");
    const apiKeysSecrets = toolsConfig?.apiKeysSecrets as
      | Record<string, string>
      | undefined;

    // Try direct apiKey first (already encrypted), then apiKeysSecrets[dyn_${id}]
    let authKey = "";
    if (provider.apiKey) {
      try {
        authKey = decrypt(provider.apiKey);
      } catch {
        // Not a valid encrypted value
      }
    }
    if (!authKey && apiKeysSecrets?.[`dyn_${providerId}`]) {
      authKey = decrypt(apiKeysSecrets[`dyn_${providerId}`]);
    }
    if (!authKey) return null;

    return {
      baseURL: provider.baseURL,
      authHeader: "Authorization",
      authKey,
    };
  } catch {
    return null;
  }
}

async function testProvider(provider: string): Promise<ProviderTestResult> {
  // Try exact match first
  let config = PROVIDER_CONFIGS[provider];
  let testKey = provider;

  // Case-insensitive fallback for static configs
  if (!config) {
    const lower = provider.toLowerCase();
    config = PROVIDER_CONFIGS[lower];
    if (config) testKey = lower;
  }

  if (config) {
    return testProviderConfig(testKey, config);
  }

  // Look up in dynamic providers (try both casing)
  const dynamicConfig = await getDynamicProviderConfig(provider)
    ?? await getDynamicProviderConfig(provider.toLowerCase());
  if (dynamicConfig) {
    return testProviderConfig(testKey, dynamicConfig);
  }

  return {
    success: false,
    latencyMs: 0,
    error: `Unknown provider: ${provider}`,
  };
}

async function testProviderConfig(
  provider: string,
  config: ProviderConfig,
): Promise<ProviderTestResult> {
  if (!config.authKey) {
    return { success: false, latencyMs: 0, error: "No API key configured" };
  }

  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      ...config.headers,
    };

    // Google uses API key as query param instead of header
    if (provider === "google") {
      headers["x-goog-api-key"] = config.authKey;
    } else {
      headers[config.authHeader] = `Bearer ${config.authKey}`;
    }

    // Google has a different endpoint structure for listing models
    const endpoint =
      provider === "google"
        ? `${config.baseURL}/models?pageSize=1`
        : `${config.baseURL}/models`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      let errorBody = "";
      try {
        const json = await response.json();
        errorBody = json?.error?.message || json?.error || "";
      } catch {
        errorBody = response.statusText;
      }
      return {
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: ${errorBody}`.trim(),
      };
    }

    return { success: true, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    if (err?.name === "TimeoutError" || err?.message?.includes("timeout")) {
      return { success: false, latencyMs, error: "Request timed out (10s)" };
    }
    return {
      success: false,
      latencyMs,
      error: err?.message || "Connection failed",
    };
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminPermission("access admin configuration");
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: { provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const { provider } = body;
  if (!provider || typeof provider !== "string") {
    return NextResponse.json(
      { success: false, error: "Missing or invalid 'provider' field" },
      { status: 400 },
    );
  }

  const result = await testProvider(provider);
  return NextResponse.json(result);
}
