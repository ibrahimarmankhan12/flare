import { MCPServerInfo } from "app-types/mcp";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { serverCache } from "lib/cache";
import { mcpRepository } from "lib/db/repository";
import { getCurrentUser } from "lib/auth/permissions";
import logger from "lib/logger";

const MCP_SYNC_COOLDOWN_MS = 15_000;

const enqueueMcpSyncWithCooldown = async ({
  key,
  operation,
}: {
  key: string;
  operation: () => Promise<unknown>;
}) => {
  try {
    const alreadyQueued = await serverCache.has(key);
    if (alreadyQueued) return;

    await serverCache.set(key, true, MCP_SYNC_COOLDOWN_MS);
    void operation().catch((error) => {
      logger.warn(`MCP sync operation failed for key ${key}`, error);
    });
  } catch (error) {
    logger.warn("Failed to schedule MCP sync with cooldown", error);
    void operation().catch((innerError) => {
      logger.warn("Fallback MCP sync operation failed", innerError);
    });
  }
};

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !currentUser.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const servers = await mcpRepository.selectAllForUser(currentUser.id);
    const memoryClients = await mcpClientsManager
      .getClients()
      .catch((error) => {
        logger.error("Failed to get in-memory MCP clients", error);
        return [];
      });

    const memoryMap = new Map(
      memoryClients.map(({ id, client }) => [id, client] as const),
    );

    const hydrateTargets = servers.filter(
      (server) => !memoryMap.has(server.id),
    );
    const reconnectTargets = servers.filter((server) => {
      const mem = memoryMap.get(server.id);
      if (!mem) return false;
      const info = mem.getInfo();
      if (info.status === "authorizing" || info.status === "loading") {
        return false;
      }
      // Retry disconnected / stale clients so they don't get stuck forever.
      return (
        info.status === "disconnected" ||
        (info.status === "connected" && info.toolInfo.length === 0)
      );
    });

    const refreshTargets = [
      ...hydrateTargets,
      ...reconnectTargets.filter(
        (candidate) =>
          !hydrateTargets.some((added) => added.id === candidate.id),
      ),
    ];
    const hydrateTargetIds = new Set(hydrateTargets.map((s) => s.id));

    const serverIds = new Set(servers.map((s) => s.id));
    const removeTargets = memoryClients.filter(({ id }) => !serverIds.has(id));

    if (refreshTargets.length > 0) {
      for (const server of refreshTargets) {
        await enqueueMcpSyncWithCooldown({
          key: `mcp:sync:refresh:${server.id}`,
          operation: () => mcpClientsManager.refreshClient(server.id),
        });
      }
    }
    if (removeTargets.length > 0) {
      for (const client of removeTargets) {
        await enqueueMcpSyncWithCooldown({
          key: `mcp:sync:disconnect:${client.id}`,
          operation: () => mcpClientsManager.disconnectClient(client.id),
        });
      }
    }

    const result = servers.map((server) => {
      const mem = memoryMap.get(server.id);
      const info = mem?.getInfo();
      const isOwner = server.userId === currentUser.id;

      let status: MCPServerInfo["status"];
      if (info?.status) {
        status = info.status;
      } else if (hydrateTargetIds.has(server.id)) {
        status = "loading";
      } else {
        status = "disconnected";
      }

      const mcpInfo: MCPServerInfo = {
        ...server,
        config: isOwner ? server.config : undefined,
        enabled: info?.enabled ?? true,
        status,
        error: info?.error,
        toolInfo: info?.toolInfo ?? [],
      };
      return mcpInfo;
    });

    return Response.json(result);
  } catch (error) {
    logger.error("Failed to load MCP list", error);
    return Response.json(
      { message: "Failed to load MCP servers. Please try again." },
      { status: 500 },
    );
  }
}
