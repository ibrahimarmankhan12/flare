#!/usr/bin/env node
/**
 * MCP server for Logo.dev API
 * Fetches company logos by domain name.
 * API: https://logo.dev
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.LOGODEV_API_KEY || process.env.LOGO_DEV_API_KEY;
if (!API_KEY) {
  console.error("Error: LOGODEV_API_KEY environment variable is required");
  process.exit(1);
}

const BASE_URL = "https://img.logo.dev";
const SIZES = ["xs", "sm", "md", "lg", "xl", "xxl", "xxxl"];

async function fetchLogoData(
  domain,
  format = "png",
  size = "md",
  grayscale = false,
) {
  const params = new URLSearchParams({
    token: API_KEY,
    format,
    size,
  });
  if (grayscale) params.set("gray", "true");
  const url = `${BASE_URL}/${domain}?${params}`;
  return url; // Logo.dev returns the image directly, so we return the URL
}

const server = new Server(
  { name: "logo-dev-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_logo",
      description:
        "Get a company logo by domain name. Returns the direct image URL that can be displayed.",
      inputSchema: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description:
              "Domain name to fetch the logo for (e.g. 'google.com', 'anthropic.com', 'github.com')",
          },
          format: {
            type: "string",
            enum: ["png", "svg"],
            description: "Image format. SVG requires a paid plan.",
            default: "png",
          },
          size: {
            type: "string",
            enum: SIZES,
            description:
              "Logo size preset: xs=16px, sm=32px, md=64px, lg=128px, xl=256px, xxl=512px, xxxl=1024px",
            default: "md",
          },
          grayscale: {
            type: "boolean",
            description: "Return a grayscale version of the logo",
            default: false,
          },
        },
        required: ["domain"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_logo": {
      const { domain, format = "png", size = "md", grayscale = false } = args;
      const logoUrl = await fetchLogoData(domain, format, size, grayscale);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                domain,
                logo_url: logoUrl,
                format,
                size,
                grayscale,
                html: `<img src="${logoUrl}" alt="${domain} logo" />`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Logo.dev MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
