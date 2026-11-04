import { describe, expect, it } from "vitest";
import { validateMcpServerConfig } from "./validate-mcp-server-config";

describe("validateMcpServerConfig", () => {
  it("accepts GitHub Copilot MCP endpoint", () => {
    expect(() =>
      validateMcpServerConfig({
        url: "https://api.githubcopilot.com/mcp/",
        headers: {
          Authorization: "Bearer ghp_example",
        },
      }),
    ).not.toThrow();
  });

  it("accepts unresolved input placeholders in headers", () => {
    expect(() =>
      validateMcpServerConfig({
        url: "https://mcp.notion.com/mcp",
        headers: {
          Authorization: "Bearer ${input:your_token}",
        },
      }),
    ).not.toThrow();
  });

  it("accepts valid remote MCP config", () => {
    expect(() =>
      validateMcpServerConfig({
        url: "https://mcp.notion.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      }),
    ).not.toThrow();
  });

  it("accepts stdio MCP config", () => {
    expect(() =>
      validateMcpServerConfig({
        command: "npx",
        args: ["@playwright/mcp@latest"],
      }),
    ).not.toThrow();
  });
});
