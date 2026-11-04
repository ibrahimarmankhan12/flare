import {
  AppDefaultToolkit,
  DefaultToolName,
  ImageToolName,
} from "lib/ai/tools";

const DENIED_TOOL_PATTERNS = [
  /search/i,
  /mcp/i,
  /oauth/i,
  /workflow/i,
  /browser/i,
  /build/i,
  /sandbox/i,
  /admin/i,
  /memory/i,
  /user/i,
  /profile/i,
  /api[-_]?key/i,
  /webhook/i,
  /scheduler/i,
  /connector/i,
  /^image$/i,
] as const;

const DENIED_APP_DEFAULT_TOOLKITS = new Set<string>([
  AppDefaultToolkit.Http,
  AppDefaultToolkit.WebSearch,
  AppDefaultToolkit.Browser,
  AppDefaultToolkit.Code,
  AppDefaultToolkit.Artifacts,
  AppDefaultToolkit.Canvas,
  AppDefaultToolkit.Connectors,
  AppDefaultToolkit.Memory,
]);

const DENIED_DEFAULT_TOOL_NAMES = new Set<string>([
  DefaultToolName.Http,
  DefaultToolName.WebSearch,
  DefaultToolName.WebContent,
  DefaultToolName.YouTubeSearch,
  DefaultToolName.YouTubeTranscript,
  DefaultToolName.BrowserAgent,
  ImageToolName,
]);

export type EmbedToolPolicyInput = {
  toolChoice?: string;
  mentions?: Array<{ type?: string; [key: string]: unknown }>;
  allowedMcpServers?: Record<string, unknown>;
  allowedAppDefaultToolkit?: string[];
  imageTool?: unknown;
};

export type EmbedToolPolicyResult = {
  toolChoice: "none";
  mentions: Array<{ type?: string; [key: string]: unknown }>;
  allowedMcpServers: undefined;
  allowedAppDefaultToolkit: string[];
  imageTool: undefined;
  blockedReasons: string[];
};

export const isRestrictedEmbedToolName = (toolName: string): boolean => {
  const normalized = toolName.trim();
  if (!normalized) return true;
  if (DENIED_DEFAULT_TOOL_NAMES.has(normalized)) return true;
  return DENIED_TOOL_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const filterEmbedAppDefaultToolkit = (
  toolkit: string[] | undefined,
): string[] => {
  if (!toolkit?.length) return [];
  return toolkit.filter(
    (toolkitName) =>
      !DENIED_APP_DEFAULT_TOOLKITS.has(toolkitName) &&
      !isRestrictedEmbedToolName(toolkitName),
  );
};

export const filterEmbedMentions = <
  TMention extends { type?: string; [key: string]: unknown },
>(
  mentions: TMention[] | undefined,
): TMention[] => {
  if (!mentions?.length) return [];
  return mentions.filter((mention) => mention.type === "agent");
};

export const applyEmbedToolPolicy = (
  input: EmbedToolPolicyInput,
): EmbedToolPolicyResult => {
  const blockedReasons: string[] = [];
  const mentions = filterEmbedMentions(input.mentions);
  const allowedAppDefaultToolkit = filterEmbedAppDefaultToolkit(
    input.allowedAppDefaultToolkit,
  );

  if (input.toolChoice && input.toolChoice !== "none") {
    blockedReasons.push("tool-choice-disabled");
  }
  if (input.allowedMcpServers && Object.keys(input.allowedMcpServers).length) {
    blockedReasons.push("mcp-disabled");
  }
  if ((input.mentions?.length ?? 0) !== mentions.length) {
    blockedReasons.push("restricted-mentions-disabled");
  }
  if (
    (input.allowedAppDefaultToolkit?.length ?? 0) !==
    allowedAppDefaultToolkit.length
  ) {
    blockedReasons.push("restricted-app-tools-disabled");
  }
  if (input.imageTool) {
    blockedReasons.push("image-tool-disabled");
  }

  return {
    toolChoice: "none",
    mentions,
    allowedMcpServers: undefined,
    allowedAppDefaultToolkit,
    imageTool: undefined,
    blockedReasons,
  };
};

export const filterEmbedBoundTools = <TTool>(
  tools: Record<string, TTool>,
): Record<string, TTool> =>
  Object.fromEntries(
    Object.entries(tools).filter(
      ([toolName]) => !isRestrictedEmbedToolName(toolName),
    ),
  );
