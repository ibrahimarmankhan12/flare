import { NextResponse } from "next/server";
import { serverCache } from "lib/cache";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { randomUUID } from "node:crypto";

const getCacheProvider = () => {
  if (process.env.REDIS_URL) return "redis";
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return "upstash-rest";
  }
  return "memory";
};

export async function GET() {
  const cacheProvider = getCacheProvider();

  let cacheOk = false;
  let cacheError: string | null = null;
  const cacheProbeKey = `health:cache:${randomUUID()}`;

  try {
    await serverCache.set(cacheProbeKey, { ok: true }, 5_000);
    const hit = await serverCache.get<{ ok: boolean }>(cacheProbeKey);
    cacheOk = Boolean(hit?.ok);
    await serverCache.delete(cacheProbeKey);
  } catch (error) {
    cacheError = error instanceof Error ? error.message : "Unknown cache error";
  }

  let mcpClientCount = 0;
  let mcpError: string | null = null;
  try {
    const clients = await mcpClientsManager.getClients();
    mcpClientCount = clients.length;
  } catch (error) {
    mcpError = error instanceof Error ? error.message : "Unknown MCP error";
  }

  return NextResponse.json(
    {
      status: cacheOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      service: "flare-ai",
      cache: {
        provider: cacheProvider,
        ok: cacheOk,
        error: cacheError,
      },
      mcp: {
        clientCount: mcpClientCount,
        error: mcpError,
      },
    },
    { status: cacheOk ? 200 : 503 },
  );
}
