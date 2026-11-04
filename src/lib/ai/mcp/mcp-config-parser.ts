import type { MCPServerConfig } from "app-types/mcp";
import { isMaybeMCPServerConfig } from "./is-mcp-config";

type SafeParseResult<T> =
  | {
      success: true;
      value: T;
      error?: unknown;
    }
  | {
      success: false;
      error: unknown;
      value?: T;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let escaped = false;
  let quoteChar = '"';

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];

    if (inSingleLineComment) {
      if (char === "\n" || char === "\r") {
        inSingleLineComment = false;
        output += char;
      }
      continue;
    }

    if (inMultiLineComment) {
      if (char === "*" && next === "/") {
        inMultiLineComment = false;
        index++;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inSingleLineComment = true;
      index++;
      continue;
    }

    if (char === "/" && next === "*") {
      inMultiLineComment = true;
      index++;
      continue;
    }

    output += char;
  }

  return output;
}

function removeTrailingCommas(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let quoteChar = '"';

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      output += char;
      continue;
    }

    if (char === ",") {
      let lookaheadIndex = index + 1;
      while (lookaheadIndex < input.length) {
        const lookaheadChar = input[lookaheadIndex];
        if (lookaheadChar.trim().length === 0) {
          lookaheadIndex++;
          continue;
        }
        if (lookaheadChar === "}" || lookaheadChar === "]") {
          break;
        }
        output += char;
        break;
      }
      continue;
    }

    output += char;
  }

  return output;
}

export function safeJSONCParse<T = unknown>(json: string): SafeParseResult<T> {
  try {
    const normalized = json.replace(/^\uFEFF/, "");
    const withoutComments = stripJsonComments(normalized);
    const withoutTrailingCommas = removeTrailingCommas(withoutComments);
    const parsed = JSON.parse(withoutTrailingCommas) as T;
    return {
      success: true,
      value: parsed,
    };
  } catch (error) {
    return {
      success: false,
      error,
    };
  }
}

export function normalizeMCPConfigRecord(
  config: unknown,
): Record<string, MCPServerConfig> {
  if (!isRecord(config)) {
    throw new Error("MCP configuration must be a JSON object");
  }

  const serverRecord = (
    "mcpServers" in config ? config.mcpServers : config
  ) as unknown;

  if (!isRecord(serverRecord)) {
    throw new Error('"mcpServers" must be an object');
  }

  return Object.entries(serverRecord).reduce(
    (acc, [name, serverConfig]) => {
      if (!isMaybeMCPServerConfig(serverConfig)) {
        throw new Error(
          `Invalid MCP config for "${name}": expected either "command" or "url"`,
        );
      }
      acc[name] = serverConfig;
      return acc;
    },
    {} as Record<string, MCPServerConfig>,
  );
}

export function extractSingleMCPServerConfig(config: unknown): {
  name?: string;
  config: MCPServerConfig;
} | null {
  if (isMaybeMCPServerConfig(config)) {
    return { config };
  }

  let normalizedRecord: Record<string, MCPServerConfig>;
  try {
    normalizedRecord = normalizeMCPConfigRecord(config);
  } catch {
    return null;
  }

  const entries = Object.entries(normalizedRecord);
  if (entries.length !== 1) {
    return null;
  }

  const [name, serverConfig] = entries[0];
  return {
    name,
    config: serverConfig,
  };
}
