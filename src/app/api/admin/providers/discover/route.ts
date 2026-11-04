import "server-only";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "lib/auth/permissions";

// GET ?baseURL=...&apiKey=...
export async function GET(req: Request) {
  try {
    await requireAdminPermission("discover provider models");
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const baseURL = url.searchParams.get("baseURL");
  const apiKey = url.searchParams.get("apiKey");

  if (!baseURL) {
    return NextResponse.json({ success: false, error: "baseURL is required" }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["api-key"] = apiKey;
    }

    const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `HTTP ${response.status}: ${response.statusText}` }, { status: 200 });
    }

    const data = await response.json();

    // Handle OpenAI-compatible format: { data: [{ id: "model-id", ... }] }
    let models: string[] = [];
    if (Array.isArray(data)) {
      models = data.map((m: any) => m.id || m.name).filter(Boolean);
    } else if (data.data && Array.isArray(data.data)) {
      models = data.data.map((m: any) => m.id || m.name).filter(Boolean);
    } else if (data.models && Array.isArray(data.models)) {
      models = data.models.map((m: any) => typeof m === "string" ? m : (m.id || m.name)).filter(Boolean);
    }

    return NextResponse.json({ success: true, models: [...new Set(models)] });
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return NextResponse.json({ success: false, error: "Request timed out (10s)" }, { status: 200 });
    }
    return NextResponse.json({ success: false, error: err?.message || "Discovery failed" }, { status: 200 });
  }
}
