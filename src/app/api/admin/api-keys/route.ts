import "server-only";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { encrypt, isEncryptionAvailable } from "lib/security/encryption";

const KNOWN_KEYS = [
  { id: "exa", label: "Exa AI (Web Search)", envVar: "EXA_API_KEY" },
  {
    id: "firecrawl",
    label: "Firecrawl (Browser)",
    envVar: "FIRECRAWL_API_KEY",
  },
  { id: "youtube", label: "YouTube Data API", envVar: "YOUTUBE_API_KEY" },
  {
    id: "supadata",
    label: "Supadata (Transcripts)",
    envVar: "SUPADATA_API_KEY",
  },
  { id: "konvo", label: "KonvO AI (Speech/OCR)", envVar: "KONVO_AI_API" },
  {
    id: "dodo_api_key",
    label: "Dodo Payments (API Key)",
    envVar: "DODO_PAYMENTS_API_KEY",
  },
  {
    id: "dodo_webhook_secret",
    label: "Dodo Payments (Webhook Secret)",
    envVar: "DODO_WEBHOOK_SECRET",
  },
];

// Merge env-var keys with DB keys. Env takes precedence.
function buildMergedKeys(
  dbKeys: Record<string, string>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of KNOWN_KEYS) {
    // Env var wins if set (never expose env var values to client)
    result[key.id] = !!(
      process.env[key.envVar] || (dbKeys[key.id] ? true : false)
    );
  }
  return result;
}

// Get all configured key IDs from DB
async function getDbKeys(): Promise<Record<string, string>> {
  try {
    const config = await siteConfigRepository.getConfig("tools");
    const raw = config?.apiKeys as Record<string, unknown> | undefined;
    if (!raw) return {};
    const result: Record<string, string> = {};
    Object.keys(raw).forEach((k) => {
      const v = raw[k];
      if (typeof v === "string" && v.length > 0) result[k] = v;
    });
    return result;
  } catch {
    return {};
  }
}

// Mask a key for display: show first 4 and last 4 chars
function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

export async function GET() {
  try {
    await requireAdminPermission("view API keys");
    const dbKeys = await getDbKeys();
    const merged = buildMergedKeys(dbKeys);

    const keys = KNOWN_KEYS.map((k) => ({
      id: k.id,
      label: k.label,
      envVar: k.envVar,
      configured: merged[k.id],
      masked: dbKeys[k.id] ? maskKey(dbKeys[k.id]) : null,
      hasEnvOverride: !!process.env[k.envVar],
    }));

    return NextResponse.json({
      success: true,
      keys,
      encryptionAvailable: isEncryptionAvailable(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Failed to load" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminPermission("manage API keys");
    const { keyId, value } = await req.json();

    if (!keyId || typeof keyId !== "string") {
      return NextResponse.json(
        { success: false, error: "keyId is required" },
        { status: 400 },
      );
    }

    const known = KNOWN_KEYS.find((k) => k.id === keyId);
    if (!known) {
      return NextResponse.json(
        { success: false, error: "Unknown key ID" },
        { status: 400 },
      );
    }

    // Env override: can't set key if already in env
    if (process.env[known.envVar]) {
      return NextResponse.json(
        {
          success: false,
          error: `This key is set via environment variable. Remove ${known.envVar} first to manage from dashboard.`,
        },
        { status: 409 },
      );
    }

    if (!isEncryptionAvailable()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Encryption not configured. Set ENCRYPTION_MASTER_KEY env var.",
        },
        { status: 500 },
      );
    }

    const dbKeys = await getDbKeys();

    if (value === null || value === "") {
      // Delete key
      delete dbKeys[keyId];
    } else {
      // Encrypt and store
      if (typeof value !== "string" || value.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "Invalid key value" },
          { status: 400 },
        );
      }
      dbKeys[keyId] = encrypt(value.trim());
    }

    const toolsConfig = await siteConfigRepository.getConfig("tools");
    await siteConfigRepository.upsert("tools", {
      ...(toolsConfig ?? {}),
      apiKeysSecrets: dbKeys,
      apiKeys: {
        ...((toolsConfig?.apiKeys as Record<string, boolean>) ?? {}),
        [keyId]: !!value,
      },
    });

    return NextResponse.json({
      success: true,
      configured: !!value,
      masked: value ? maskKey(value.trim()) : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Failed to save" },
      { status: 500 },
    );
  }
}
