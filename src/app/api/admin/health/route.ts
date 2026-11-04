import "server-only";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { pgDb } from "lib/db/pg/db.pg";
import { sql } from "drizzle-orm";
import { getEnabledProviders } from "lib/site-config-runtime";
import { customModelProvider } from "lib/ai/models";

interface ProviderProbe {
  name: string;
  status: "ok" | "error" | "rate_limited" | "disabled" | "no_key";
  latencyMs?: number;
  error?: string;
}

interface HealthResult {
  db: { status: "ok" | "error"; latencyMs?: number; error?: string };
  redis: { status: "ok" | "disabled" | "error"; latencyMs?: number; error?: string };
  providers: ProviderProbe[];
  checkedAt: string;
}

// Providers we can actively probe with a real HTTP call
const PROBEABLE_PROVIDERS: Record<string, { url: string; getKey: () => string | undefined }> = {
  flare: {
    url: "https://api.flare-sh.tech/v1/models",
    getKey: () => process.env.FLARE_API_KEY || process.env.KORE_API_KEY,
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    getKey: () => process.env.GROQ_API_KEY,
  },
};

async function probeProvider(
  providerKey: string,
  config: { url: string; getKey: () => string | undefined },
): Promise<ProviderProbe> {
  const apiKey = config.getKey();
  if (!apiKey) {
    return { name: providerKey, status: "no_key" };
  }

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(config.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (res.status === 429) {
      return { name: providerKey, status: "rate_limited", latencyMs, error: "Rate limited (429)" };
    }
    if (!res.ok) {
      return { name: providerKey, status: "error", latencyMs, error: `HTTP ${res.status}` };
    }
    return { name: providerKey, status: "ok", latencyMs };
  } catch (e: any) {
    const isTimeout = e?.name === "AbortError" || e?.message?.includes("abort");
    return {
      name: providerKey,
      status: isTimeout ? "error" : "error",
      error: isTimeout ? "Request timed out after 5s" : e?.message ?? "Connection failed",
    };
  }
}

async function checkProviderHealth(
  providerKey: string,
  hasApiKey: boolean,
  isEnabled: boolean,
): Promise<ProviderProbe> {
  if (!isEnabled) {
    return { name: providerKey, status: "disabled" };
  }
  if (!hasApiKey) {
    return { name: providerKey, status: "no_key" };
  }

  // Try active probe for known probeable providers
  const config = PROBEABLE_PROVIDERS[providerKey];
  if (config) {
    return probeProvider(providerKey, config);
  }

  // For providers with an API key but no active probe (rely on key presence)
  return { name: providerKey, status: "ok" };
}

export async function GET() {
  try {
    await requireAdminPermission("access health checks");

    const [enabledProviders, modelsInfo] = await Promise.all([
      getEnabledProviders(),
      Promise.resolve(customModelProvider.modelsInfo),
    ]);

    // Build hasApiKey map from modelsInfo
    const hasApiKeyMap: Record<string, boolean> = {};
    for (const info of modelsInfo) {
      hasApiKeyMap[info.provider] = info.hasAPIKey;
    }

    // Probe all known providers
    const allProviders = modelsInfo.map((p) => p.provider);
    const probes = await Promise.all(
      allProviders.map((p) =>
        checkProviderHealth(
          p,
          hasApiKeyMap[p] ?? false,
          enabledProviders.has(p.toLowerCase()),
        ),
      ),
    );

    const result: HealthResult = {
      db: { status: "ok" },
      redis: { status: "disabled" },
      providers: probes,
      checkedAt: new Date().toISOString(),
    };

    // DB probe
    try {
      const start = Date.now();
      await pgDb.execute(sql`SELECT 1`);
      result.db = { status: "ok", latencyMs: Date.now() - start };
    } catch (e: any) {
      result.db = { status: "error", error: e?.message ?? "Unknown DB error" };
    }

    // Redis probe
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        await fetch(redisUrl, { signal: controller.signal, method: "HEAD" });
        clearTimeout(timeout);
        result.redis = { status: "ok", latencyMs: Date.now() - start };
      } catch {
        result.redis = { status: "error" };
      }
    }

    return NextResponse.json({ success: true, health: result });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Health check failed" },
      { status: 500 },
    );
  }
}