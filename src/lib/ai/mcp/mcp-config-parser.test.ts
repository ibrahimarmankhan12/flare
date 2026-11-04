import { describe, expect, it } from "vitest";
import {
  extractSingleMCPServerConfig,
  normalizeMCPConfigRecord,
  safeJSONCParse,
} from "./mcp-config-parser";

describe("mcp-config-parser", () => {
  describe("safeJSONCParse", () => {
    it("parses JSON with comments and trailing commas", () => {
      const result = safeJSONCParse(`
        {
          // trailing comma should be accepted
          "playwright": {
            "command": "npx",
            "args": ["@playwright/mcp@latest",],
          },
        }
      `);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest"],
          },
        });
      }
    });
  });

  describe("normalizeMCPConfigRecord", () => {
    it("accepts top-level record format", () => {
      const parsed = normalizeMCPConfigRecord({
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest"],
        },
      });

      expect(parsed).toEqual({
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest"],
        },
      });
    });

    it("accepts mcpServers wrapper format", () => {
      const parsed = normalizeMCPConfigRecord({
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest"],
          },
        },
      });

      expect(parsed).toEqual({
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest"],
        },
      });
    });

    it("throws for invalid server shape", () => {
      expect(() =>
        normalizeMCPConfigRecord({
          mcpServers: {
            broken: {
              transport: "stdio",
            },
          },
        }),
      ).toThrow("Invalid MCP config");
    });
  });

  describe("extractSingleMCPServerConfig", () => {
    it("extracts direct server config", () => {
      const result = extractSingleMCPServerConfig({
        command: "npx",
        args: ["@playwright/mcp@latest"],
      });

      expect(result).toEqual({
        config: {
          command: "npx",
          args: ["@playwright/mcp@latest"],
        },
      });
    });

    it("extracts one server from wrapper and infers name", () => {
      const result = extractSingleMCPServerConfig({
        mcpServers: {
          playwright: {
            command: "npx",
          },
        },
      });

      expect(result).toEqual({
        name: "playwright",
        config: {
          command: "npx",
        },
      });
    });

    it("returns null for multi-server payloads", () => {
      const result = extractSingleMCPServerConfig({
        mcpServers: {
          playwright: {
            command: "npx",
          },
          github: {
            url: "https://example.com/mcp",
          },
        },
      });

      expect(result).toBeNull();
    });
  });
});
