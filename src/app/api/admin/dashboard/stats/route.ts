import "server-only";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { pgDb } from "lib/db/pg/db.pg";
import { sql } from "drizzle-orm";

interface ProviderStats {
  name: string;
  calls: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number | null;
}

interface ModelStats {
  model: string;
  provider: string;
  calls: number;
  errors: number;
}

interface DashboardStats {
  totalUsers: number;
  activeThreads: number;
  totalThreads: number;
  errorRate: number;
  providersOnline: number;
  providersTotal: number;
  modelCallsToday: number;
  generatedAt: string;
  providerStats: ProviderStats[];
  topModels: ModelStats[];
}

export async function GET() {
  try {
    await requireAdminPermission("access dashboard stats");

    const stats: DashboardStats = {
      totalUsers: 0,
      activeThreads: 0,
      totalThreads: 0,
      errorRate: 0,
      providersOnline: 0,
      providersTotal: 0,
      modelCallsToday: 0,
      generatedAt: new Date().toISOString(),
      providerStats: [],
      topModels: [],
    };

    // Total users
    try {
      const users = await pgDb.execute(sql`
        SELECT COUNT(*) as count FROM users
      `);
      const row = users.rows[0] as { count: string } | undefined;
      stats.totalUsers = Number(row?.count ?? 0);
    } catch { /* ignore */ }

    // Total threads
    try {
      const threads = await pgDb.execute(sql`
        SELECT COUNT(*) as count FROM threads
      `);
      const row = threads.rows[0] as { count: string } | undefined;
      stats.totalThreads = Number(row?.count ?? 0);
    } catch { /* ignore */ }

    // Active threads (last 24h)
    try {
      const active = await pgDb.execute(sql`
        SELECT COUNT(*) as count FROM threads
        WHERE "updatedAt" >= NOW() - INTERVAL '24 hours'
      `);
      const row = active.rows[0] as { count: string } | undefined;
      stats.activeThreads = Number(row?.count ?? 0);
    } catch { /* ignore */ }

    // Chat messages today (model calls)
    try {
      const messagesToday = await pgDb.execute(sql`
        SELECT COUNT(*) as count FROM chat_message
        WHERE "createdAt" >= CURRENT_DATE
          AND role = 'assistant'
      `);
      const row = messagesToday.rows[0] as { count: string } | undefined;
      stats.modelCallsToday = Number(row?.count ?? 0);
    } catch { /* ignore */ }

    // Per-model stats from chat_message metadata (last 7 days)
    // Aggregate by provider + model from JSON metadata
    try {
      const modelStats = await pgDb.execute(sql`
        SELECT
          m.metadata->>'model'   as model,
          m.metadata->>'provider' as provider,
          COUNT(*)                as calls,
          SUM(
            CASE WHEN m.metadata->>'error' IS NOT NULL THEN 1 ELSE 0 END
          )                        as errors
        FROM chat_message m
        WHERE m.role = 'assistant'
          AND m.metadata->>'model' IS NOT NULL
          AND m."createdAt" >= NOW() - INTERVAL '7 days'
        GROUP BY 1, 2
        ORDER BY calls DESC
        LIMIT 10
      `);
      stats.topModels = modelStats.rows.map((row: any) => ({
        model: row.model ?? "unknown",
        provider: row.provider ?? "unknown",
        calls: Number(row.calls ?? 0),
        errors: Number(row.errors ?? 0),
      }));
    } catch { /* ignore */ }

    // Per-provider summary derived from topModels
    const providerMap = new Map<string, { calls: number; errors: number; errorRate: number }>();
    for (const m of stats.topModels) {
      const existing = providerMap.get(m.provider) ?? { calls: 0, errors: 0, errorRate: 0 };
      existing.calls += m.calls;
      existing.errors += m.errors;
      existing.errorRate = existing.calls > 0 ? (existing.errors / existing.calls) * 100 : 0;
      providerMap.set(m.provider, existing);
    }

    // Provider names mapping
    const providerDisplayNames: Record<string, string> = {
      flare: "Flare",
      groq: "Groq",
      google: "Google Gemini",
      openai: "OpenAI",
      openrouter: "OpenRouter",
      anthropic: "Anthropic",
      xai: "xAI",
      ollama: "Ollama",
      perplexity: "Perplexity",
      perplex: "Perplexity",
    };

    stats.providerStats = Array.from(providerMap.entries()).map(([key, v]) => ({
      name: providerDisplayNames[key.toLowerCase()] ?? key,
      calls: v.calls,
      errors: v.errors,
      errorRate: Math.round(v.errorRate * 10) / 10,
      avgLatencyMs: null,
    }));

    stats.providersTotal = stats.providerStats.length;
    stats.providersOnline = stats.providerStats.length; // all derived from real data

    return NextResponse.json({ success: true, stats });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Failed to load stats" },
      { status: 500 },
    );
  }
}
