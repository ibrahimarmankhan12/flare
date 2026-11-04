import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  type MCPServerInfo,
  MCPRemoteConfigZodSchema,
  MCPStdioConfigZodSchema,
  type MCPServerConfig,
  type MCPToolInfo,
} from "app-types/mcp";

import { isMaybeRemoteConfig, isMaybeStdioConfig } from "./is-mcp-config";
import logger from "logger";
import type { ConsolaInstance } from "consola";
import { colorize } from "consola/utils";
import {
  createDebounce,
  errorToString,
  generateUUID,
  isNull,
  Locker,
  withTimeout,
} from "lib/utils";
import { getRequiredBaseUrl, IS_MCP_SERVER_REMOTE_ONLY } from "lib/const";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { PgOAuthClientProvider } from "./pg-oauth-provider";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

type ClientOptions = {
  autoDisconnectSeconds?: number;
};

// `.env` / `.env.example` ship these keys declared-but-empty. A bare
// `!= null` check treats "" as configured, so `parseInt("")` yielded NaN
// and every timeout fired immediately — listTools always failed with
// "Timeout". Treat blank/non-positive/non-numeric values as unset.
const parseTimeoutMs = (raw: string | undefined, fallback: number): number => {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MCP_CONNECT_TIMEOUT = parseTimeoutMs(
  process.env.MCP_CONNECT_TIMEOUT,
  15000, // Reduced from 60s to 15s to prevent blocking
);

const MCP_MAX_TOTAL_TIMEOUT = parseTimeoutMs(
  process.env.MCP_MAX_TOTAL_TIMEOUT,
  30000, // Reduced from 120s to 30s to prevent blocking
);

const MCP_TOOL_TIMEOUT = parseTimeoutMs(
  process.env.MCP_TOOL_TIMEOUT,
  20000, // Reduced from 45s to 20s
);

/**
 * Client class for Model Context Protocol (MCP) server connections
 */
export class MCPClient {
  private client?: Client;
  private error?: unknown;
  private authorizationUrl?: URL;
  protected isConnected = false;
  private logger: ConsolaInstance;
  private locker = new Locker();
  private transport?: Transport;
  private oauthProvider?: PgOAuthClientProvider;
  // Information about available tools from the server
  toolInfo: MCPToolInfo[] = [];
  private disconnectDebounce = createDebounce();
  private needOauthProvider = false;
  private inProgressToolCallIds: string[] = [];
  constructor(
    private id: string,
    private name: string,
    private serverConfig: MCPServerConfig,

    private options: ClientOptions = {},
  ) {
    this.logger = logger.withDefaults({
      message: colorize(
        "cyan",
        `[${this.id.slice(0, 4)}] MCP Client ${this.name}: `,
      ),
    });
  }

  get status() {
    if (this.locker.isLocked) return "loading";
    if (this.authorizationUrl) return "authorizing";
    if (this.isConnected) return "connected";
    return "disconnected";
  }

  get hasActiveToolCalls() {
    return this.inProgressToolCallIds.length > 0;
  }

  getAuthorizationUrl(): URL | undefined {
    return this.authorizationUrl;
  }

  async finishAuth(code: string, state: string) {
    if (!isMaybeRemoteConfig(this.serverConfig))
      throw new Error("OAuth flow requires a remote MCP server");

    if (this.status != "authorizing" || this.oauthProvider?.state() != state) {
      if (this.oauthProvider && this.oauthProvider.state() != state) {
        await this.oauthProvider.adoptState(state);
      } else {
        await this.disconnect();
        await this.connect(state);
      }
    }
    const finish = (this.transport as StreamableHTTPClientTransport)
      ?.finishAuth;

    if (!finish) throw new Error("Not Found finishAuth");

    this.logger.info("OAuth authorization: exchanging code for token");

    await finish.call(this.transport, code);
    this.authorizationUrl = undefined;
    this.logger.info("OAuth authorization: token exchange completed");
  }

  getInfo(): MCPServerInfo {
    return {
      id: this.id,
      name: this.name,
      config: this.serverConfig,
      status: this.status,
      error: this.error,
      toolInfo: this.toolInfo,
      visibility: "private" as const,
      enabled: true,
      userId: "", // This will be filled by the manager
    };
  }

  private createOAuthProvider(oauthState?: string) {
    if (isMaybeRemoteConfig(this.serverConfig) && this.needOauthProvider) {
      this.logger.info("Creating OAuth provider for MCP server authentication");
      if (this.oauthProvider) {
        if (oauthState && oauthState != this.oauthProvider.state()) {
          this.oauthProvider.adoptState(oauthState);
        }
        return this.oauthProvider;
      }
      this.oauthProvider = new PgOAuthClientProvider({
        name: this.name,
        mcpServerId: this.id,
        serverUrl: this.serverConfig.url,
        state: oauthState,
        _clientMetadata: {
          client_name: `flare-ai-${this.name}`,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none", // PKCE flow
          scope: "mcp:tools",
          redirect_uris: [
            `${getRequiredBaseUrl("MCP OAuth callback")}/api/mcp/oauth/callback`,
          ],
          software_id: "flare-ai",
          software_version: "1.0.0",
        },
        onRedirectToAuthorization: async (authorizationUrl: URL) => {
          this.logger.info(
            "OAuth authorization required - user interaction needed",
          );
          this.authorizationUrl = authorizationUrl;
          throw new OAuthAuthorizationRequiredError(authorizationUrl);
        },
      });
      return this.oauthProvider;
    }
    return undefined;
  }

  private scheduleAutoDisconnect() {
    if (!isNull(this.options.autoDisconnectSeconds)) {
      this.disconnectDebounce(() => {
        // Don't disconnect if there are tool calls in progress
        if (this.inProgressToolCallIds.length === 0) {
          this.disconnect();
        } else {
          this.logger.info(
            `Skipping auto-disconnect: ${this.inProgressToolCallIds.length} tool calls in progress`,
          );
          // Reschedule the disconnect check
          this.scheduleAutoDisconnect();
        }
      }, this.options.autoDisconnectSeconds * 1000);
    }
  }

  async connect(oauthState?: string): Promise<Client | undefined> {
    if (this.status === "loading") {
      await this.locker.wait();
      return this.client;
    }
    if (this.status === "connected") {
      return this.client;
    }
    try {
      const startedAt = Date.now();
      this.locker.lock();
      this.error = undefined;
      this.authorizationUrl = undefined;
      this.isConnected = false;
      this.client = undefined;

      const client = new Client({
        name: `flare-ai-${this.name}`,
        version: "1.0.0",
      });

      // Create appropriate transport based on server config type
      if (isMaybeStdioConfig(this.serverConfig)) {
        // Skip stdio transport
        if (IS_MCP_SERVER_REMOTE_ONLY) {
          throw new Error("VERCEL: Stdio transport is not supported");
        }

        const config = MCPStdioConfigZodSchema.parse(this.serverConfig);
        this.transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          // Merge process.env with config.env, ensuring PATH is preserved and filtering out undefined values
          env: Object.entries({ ...process.env, ...config.env }).reduce(
            (acc, [key, value]) => {
              if (value !== undefined) {
                acc[key] = value;
              }
              return acc;
            },
            {} as Record<string, string>,
          ),
          cwd: process.cwd(),
        });

        const connectPromise = client.connect(this.transport, {
          maxTotalTimeout:
            MCP_MAX_TOTAL_TIMEOUT > 0 ? MCP_MAX_TOTAL_TIMEOUT : undefined,
        });

        await (MCP_CONNECT_TIMEOUT > 0
          ? withTimeout(connectPromise, MCP_CONNECT_TIMEOUT)
          : connectPromise);
      } else if (isMaybeRemoteConfig(this.serverConfig)) {
        const config = MCPRemoteConfigZodSchema.parse(this.serverConfig);
        const abortController = new AbortController();
        const url = new URL(config.url);
        const hasStaticAuthorizationHeader = Object.keys(
          config.headers ?? {},
        ).some((key) => key.toLowerCase() === "authorization");
        try {
          this.transport = new StreamableHTTPClientTransport(url, {
            requestInit: {
              headers: config.headers,
              signal: abortController.signal,
            },
            authProvider: this.createOAuthProvider(oauthState),
          });
          const connectPromise = client.connect(this.transport, {
            maxTotalTimeout:
              MCP_MAX_TOTAL_TIMEOUT > 0 ? MCP_MAX_TOTAL_TIMEOUT : undefined,
          });

          await (MCP_CONNECT_TIMEOUT > 0
            ? withTimeout(connectPromise, MCP_CONNECT_TIMEOUT)
            : connectPromise);
        } catch (streamableHttpError: any) {
          // Check if it's OAuth error and we haven't tried OAuth yet
          if (
            isUnauthorized(streamableHttpError) &&
            !this.needOauthProvider &&
            !hasStaticAuthorizationHeader
          ) {
            this.logger.info(
              "OAuth authentication required, retrying with OAuth provider",
            );
            this.needOauthProvider = true;
            this.locker.unlock();
            await this.disconnect();
            return this.connect(oauthState); // Recursive call with OAuth
          }

          if (isOAuthAuthorizationRequired(streamableHttpError)) {
            this.logger.info(
              "OAuth authorization required before MCP connection can be established",
            );
            // Keep current transport/provider state so finishAuth can complete.
            this.client = client;
            this.isConnected = false;
            return this.client;
          }

          if (!isOAuthAuthorizationRequired(streamableHttpError)) {
            this.logger.warn(
              `Streamable HTTP connection failed, Because ${streamableHttpError.message}, falling back to SSE transport`,
            );

            this.transport = new SSEClientTransport(url, {
              requestInit: {
                headers: config.headers,
                signal: abortController.signal,
              },
              authProvider: this.createOAuthProvider(oauthState),
            });

            try {
              const connectPromise = client.connect(this.transport, {
                maxTotalTimeout:
                  MCP_MAX_TOTAL_TIMEOUT > 0 ? MCP_MAX_TOTAL_TIMEOUT : undefined,
              });

              await (MCP_CONNECT_TIMEOUT > 0
                ? withTimeout(connectPromise, MCP_CONNECT_TIMEOUT)
                : connectPromise);
            } catch (sseError) {
              if (
                isUnauthorized(sseError) &&
                !this.needOauthProvider &&
                !hasStaticAuthorizationHeader
              ) {
                this.logger.info(
                  "OAuth authentication required for SSE, retrying with OAuth provider",
                );
                this.needOauthProvider = true;
                this.locker.unlock();
                await this.disconnect();
                return this.connect(oauthState); // Recursive call with OAuth
              }

              if (isOAuthAuthorizationRequired(sseError)) {
                this.logger.info(
                  "OAuth authorization required before MCP connection can be established",
                );
                // Keep current transport/provider state so finishAuth can complete.
                this.client = client;
                this.isConnected = false;
                return this.client;
              }
              throw sseError;
            }
          }
        }
      } else {
        throw new Error("Invalid server config");
      }

      this.logger.info(
        `Connected to MCP server in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`,
      );
      this.client = client;
      this.isConnected = true;

      this.scheduleAutoDisconnect();
    } catch (error) {
      this.logger.error(error);
      // On timeout or failure, ensure transport is torn down so a retry isn't blocked
      await this.transport?.close?.().catch(() => null);
      this.transport = undefined;
      this.isConnected = false;
      this.error = errorToString(error);
      this.transport = undefined;
      throw error;
    } finally {
      this.locker.unlock();
    }

    await this.updateToolInfo();

    return this.client;
  }

  /**
   * Ensure the underlying OAuth provider adopts the callback state
   * so that PKCE code_verifier matches in multi-instance environments.
   */
  async ensureOAuthState(state: string): Promise<void> {
    if (!state) return;
    await this.oauthProvider?.adoptState(state);
  }

  async disconnect() {
    this.logger.info("Disconnecting from MCP server");
    await this.locker.wait();
    this.isConnected = false;
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;

    // Actually wait for close to complete
    if (client?.close) {
      try {
        await client.close();
      } catch (e) {
        this.logger.error("Error closing MCP client:", e);
      }
    }
  }

  async updateToolInfo() {
    if (this.status === "connected" && this.client) {
      try {
        this.logger.info("Updating tool info");
        // Add timeout to listTools to prevent hanging
        const toolResponse = await withTimeout(
          this.client.listTools(),
          MCP_TOOL_TIMEOUT,
        );
        this.toolInfo = toolResponse.tools.map(
          (tool) =>
            ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }) as MCPToolInfo,
        );
        this.logger.info(`Found ${this.toolInfo.length} tools`);
      } catch (error) {
        this.logger.error("Failed to update tool info:", error);
        // Don't throw - just log the error and continue with existing tools
      }
    }
  }

  async callTool(toolName: string, input?: unknown) {
    const id = generateUUID();
    this.inProgressToolCallIds.push(id);
    const toolCallTimeoutMs = MCP_TOOL_TIMEOUT;
    try {
      this.logger.info("tool call", toolName);
      const client = await this.connect();
      if (this.status === "authorizing") {
        throw new Error("OAuth authorization required. Try Refresh MCP Client");
      }
      if (!client) {
        throw new Error("MCP client not connected");
      }

      const result = await withTimeout(
        client.callTool({
          name: toolName,
          arguments: input as Record<string, unknown>,
        }),
        toolCallTimeoutMs,
      );

      return result;
    } catch (err: any) {
      const errorMessage = err?.message || String(err);

      // Handle timeout errors
      if (errorMessage.includes("Timeout")) {
        this.logger.warn(
          `Tool call '${toolName}' timed out after ${toolCallTimeoutMs}ms`,
        );
        await this.disconnect();
      }
      // Handle transport closed errors - attempt reconnection
      else if (
        errorMessage.includes("Transport is closed") ||
        errorMessage.includes("Connection closed") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("socket hang up")
      ) {
        this.logger.info("Connection issue detected, attempting reconnect...");
        await this.disconnect();

        try {
          // Small delay before reconnecting to avoid rapid reconnection loops
          await new Promise((resolve) => setTimeout(resolve, 500));

          const client = await this.connect();
          if (!client) {
            throw new Error("MCP client not connected after reconnect");
          }

          const retryResult = await withTimeout(
            client.callTool({
              name: toolName,
              arguments: input as Record<string, unknown>,
            }),
            toolCallTimeoutMs,
          );

          return retryResult;
        } catch (retryError: any) {
          this.logger.error("Retry tool call failed", toolName, retryError);
          return {
            isError: true,
            error: {
              message: `Retry failed: ${errorToString(retryError)}`,
              name: retryError?.name || "RETRY_ERROR",
            },
            content: [],
          };
        }
      }

      this.logger.error("Tool call failed", toolName, err);
      return {
        isError: true,
        error: {
          message: errorToString(err),
          name: err?.name || "ERROR",
        },
        content: [],
      };
    } finally {
      this.inProgressToolCallIds = this.inProgressToolCallIds.filter(
        (toolId) => toolId !== id,
      );
      this.scheduleAutoDisconnect();
    }
  }
}

/**
 * Factory function to create a new MCP client
 */
export const createMCPClient = (
  id: string,
  name: string,
  serverConfig: MCPServerConfig,
  options: ClientOptions = {},
): MCPClient => new MCPClient(id, name, serverConfig, options);

class OAuthAuthorizationRequiredError extends Error {
  constructor(public authorizationUrl: URL) {
    super("OAuth user authorization required");
    this.name = "OAuthAuthorizationRequiredError";
  }
}

function isUnauthorized(error: any): boolean {
  return (
    error instanceof UnauthorizedError ||
    error?.status === 401 ||
    error?.message?.includes("401") ||
    error?.message?.includes("Unauthorized") ||
    error?.message?.includes("invalid_token") ||
    error?.message?.includes("HTTP 401")
  );
}

function isOAuthAuthorizationRequired(error: any): boolean {
  return error instanceof OAuthAuthorizationRequiredError;
}
