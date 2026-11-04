import { describe, expect, it } from "vitest";
import {
  applyEmbedToolPolicy,
  filterEmbedAppDefaultToolkit,
  filterEmbedBoundTools,
  filterEmbedMentions,
  isRestrictedEmbedToolName,
} from "./tool-policy";

describe("embed tool policy", () => {
  it("blocks restricted tool names and permits plain agent-safe names", () => {
    expect(isRestrictedEmbedToolName("webSearch")).toBe(true);
    expect(isRestrictedEmbedToolName("mcp:listTools")).toBe(true);
    expect(isRestrictedEmbedToolName("browser-agent")).toBe(true);
    expect(isRestrictedEmbedToolName("workflow-runner")).toBe(true);
    expect(isRestrictedEmbedToolName("api_key_rotate")).toBe(true);
    expect(isRestrictedEmbedToolName("agent_summary")).toBe(false);
  });

  it("filters restricted default toolkits", () => {
    expect(
      filterEmbedAppDefaultToolkit([
        "web-search",
        "browser",
        "unknown-safe-toolkit",
        "workflow",
      ]),
    ).toEqual(["unknown-safe-toolkit"]);
  });

  it("keeps only agent mentions", () => {
    const mentions = [
      { type: "agent", agentId: "agent-1" },
      { type: "workflow", workflowId: "workflow-1" },
      { type: "mcpTool", serverId: "mcp-1" },
    ];

    expect(filterEmbedMentions(mentions)).toEqual([
      { type: "agent", agentId: "agent-1" },
    ]);
  });

  it("normalizes embed request policy to no tools", () => {
    const result = applyEmbedToolPolicy({
      toolChoice: "auto",
      mentions: [
        { type: "agent", agentId: "agent-1" },
        { type: "mcpServer", serverId: "mcp-1" },
      ],
      allowedMcpServers: { server: {} },
      allowedAppDefaultToolkit: ["web-search", "safe-local"],
      imageTool: { model: "image" },
    });

    expect(result.toolChoice).toBe("none");
    expect(result.mentions).toEqual([{ type: "agent", agentId: "agent-1" }]);
    expect(result.allowedMcpServers).toBeUndefined();
    expect(result.allowedAppDefaultToolkit).toEqual(["safe-local"]);
    expect(result.imageTool).toBeUndefined();
    expect(result.blockedReasons).toEqual([
      "tool-choice-disabled",
      "mcp-disabled",
      "restricted-mentions-disabled",
      "restricted-app-tools-disabled",
      "image-tool-disabled",
    ]);
  });

  it("filters restricted bound runtime tools", () => {
    const tools = {
      webSearch: { id: 1 },
      "mcp-tool": { id: 2 },
      agent_summary: { id: 3 },
      image: { id: 4 },
    };

    expect(filterEmbedBoundTools(tools)).toEqual({
      agent_summary: { id: 3 },
    });
  });
});
