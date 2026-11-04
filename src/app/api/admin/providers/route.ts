import "server-only";
import { NextResponse } from "next/server";
import { siteConfigRepository } from "lib/db/repository";
import { requireAdminPermission } from "lib/auth/permissions";
import { encrypt, isEncryptionAvailable } from "lib/security/encryption";

// GET — list all dynamic providers
export async function GET() {
  try {
    await requireAdminPermission("manage providers");
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const config = await siteConfigRepository.getConfig("models");
    const dynamicProviders = (config?.dynamicProviders ?? {}) as Record<
      string,
      any
    >;
    const list = Object.entries(dynamicProviders).map(
      ([id, p]: [string, any]) => ({
        id,
        name: p.name ?? id,
        baseURL: p.baseURL ?? "",
        apiKeyConfigured: !!p.apiKey,
        models: p.models ?? [],
        enabled: p.enabled ?? false,
        addedAt: p.addedAt ?? "",
      }),
    );
    return NextResponse.json({ success: true, providers: list });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to load" },
      { status: 500 },
    );
  }
}

// POST — add/update a dynamic provider
export async function POST(req: Request) {
  try {
    await requireAdminPermission("manage providers");
  } catch {
    console.error("[providers/POST] Auth failed");
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();
    const { id, name, baseURL, apiKey, models, enabled } = body;

    if (!baseURL || typeof baseURL !== "string") {
      return NextResponse.json(
        { success: false, error: "baseURL is required" },
        { status: 400 },
      );
    }

    const slug =
      id && typeof id === "string" && id.trim()
        ? id
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
        : (name || "")
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-");

    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Provider id is required" },
        { status: 400 },
      );
    }

    // Encrypt API key if provided
    let encryptedKey = "";
    if (apiKey && typeof apiKey === "string" && apiKey.trim()) {
      if (!isEncryptionAvailable()) {
        return NextResponse.json(
          { success: false, error: "Encryption not configured" },
          { status: 500 },
        );
      }
      encryptedKey = encrypt(apiKey.trim());
    }

    const currentConfig = await siteConfigRepository.getConfig("models");

    const existing =
      (currentConfig?.dynamicProviders as Record<string, any>) ?? {};

    const provider: any = {
      name: name || slug,
      baseURL: baseURL.trim(),
      models: Array.isArray(models) ? models : [],
      enabled: !!enabled,
      addedAt: existing[slug]?.addedAt ?? new Date().toISOString(),
    };

    if (encryptedKey) {
      provider.apiKey = encryptedKey;
    } else if (existing[slug]?.apiKey) {
      provider.apiKey = existing[slug].apiKey;
    }

    const updated: Record<string, any> = { ...existing, [slug]: provider };

    // Also store encrypted key reference in apiKeysSecrets under tools config
    if (encryptedKey) {
      try {
        const toolsConfig = await siteConfigRepository.getConfig("tools");
        const secrets =
          (toolsConfig?.apiKeysSecrets as Record<string, string>) ?? {};
        secrets[`dyn_${slug}`] = encryptedKey;
        await siteConfigRepository.upsert("tools", {
          ...toolsConfig,
          apiKeysSecrets: secrets,
        });
      } catch {
        /* non-critical */
      }
    }

    await siteConfigRepository.upsert("models", {
      ...(currentConfig ?? {}),
      dynamicProviders: updated,
    });

    return NextResponse.json({ success: true, id: slug });
  } catch (err: any) {
    console.error("[providers/POST] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to save" },
      { status: 500 },
    );
  }
}

// DELETE — remove a dynamic provider
export async function DELETE(req: Request) {
  try {
    await requireAdminPermission("manage providers");
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 },
      );
    }

    const currentConfig = await siteConfigRepository.getConfig("models");
    const existing =
      (currentConfig?.dynamicProviders as Record<string, any>) ?? {};

    if (!existing[id]) {
      return NextResponse.json(
        { success: false, error: "Provider not found" },
        { status: 404 },
      );
    }

    const updated = { ...existing };
    delete updated[id];

    // Remove from apiKeysSecrets too
    try {
      const toolsConfig = await siteConfigRepository.getConfig("tools");
      const secrets =
        (toolsConfig?.apiKeysSecrets as Record<string, string>) ?? {};
      delete secrets[`dyn_${id}`];
      await siteConfigRepository.upsert("tools", {
        ...toolsConfig,
        apiKeysSecrets: secrets,
      });
    } catch {
      /* non-critical */
    }

    await siteConfigRepository.upsert("models", {
      ...(currentConfig ?? {}),
      dynamicProviders: updated,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to delete" },
      { status: 500 },
    );
  }
}
