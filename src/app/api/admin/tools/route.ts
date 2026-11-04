import "server-only";
import { NextResponse } from "next/server";
import { siteConfigRepository } from "lib/db/repository";
import { requireAdminPermission } from "lib/auth/permissions";

// GET — list all dynamic tools
export async function GET() {
  try {
    await requireAdminPermission("manage tools");
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const config = await siteConfigRepository.getConfig("tools");
    const dynamicTools = (config?.dynamicTools ?? {}) as Record<string, any>;
    const list = Object.entries(dynamicTools).map(([id, t]: [string, any]) => ({
      id,
      name: t.name ?? id,
      category: t.category ?? "Custom",
      description: t.description ?? "",
      enabled: t.enabled ?? true,
      addedAt: t.addedAt ?? "",
    }));
    return NextResponse.json({ success: true, tools: list });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Failed" }, { status: 500 });
  }
}

// POST — add/update a dynamic tool
export async function POST(req: Request) {
  try {
    await requireAdminPermission("manage tools");
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { id, name, category, description, enabled } = body;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }
    const slug = (id || name).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    const currentConfig = await siteConfigRepository.getConfig("tools");
    const existing = (currentConfig?.dynamicTools as Record<string, any>) ?? {};
    existing[slug] = {
      name: name.trim(),
      category: (category || "Custom").trim(),
      description: (description || "").trim(),
      enabled: !!enabled,
      addedAt: existing[slug]?.addedAt ?? new Date().toISOString(),
    };
    await siteConfigRepository.upsert("tools", { ...(currentConfig ?? {}), dynamicTools: existing });
    return NextResponse.json({ success: true, id: slug });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Failed" }, { status: 500 });
  }
}

// DELETE — remove a dynamic tool
export async function DELETE(req: Request) {
  try {
    await requireAdminPermission("manage tools");
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    const config = await siteConfigRepository.getConfig("tools");
    const existing = (config?.dynamicTools as Record<string, any>) ?? {};
    if (!existing[id]) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    delete existing[id];
    await siteConfigRepository.upsert("tools", { ...(config ?? {}), dynamicTools: existing });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Failed" }, { status: 500 });
  }
}
