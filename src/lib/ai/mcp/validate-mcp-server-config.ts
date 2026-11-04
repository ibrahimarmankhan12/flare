import type { MCPServerConfig } from "app-types/mcp";
import { isMaybeRemoteConfig } from "./is-mcp-config";

export function validateMcpServerConfig(config: MCPServerConfig): void {
  if (!isMaybeRemoteConfig(config)) {
    return;
  }

  new URL(config.url);
}
