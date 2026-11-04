/**
 * Seed the MCP marketplace with curated servers.
 *
 * Usage:
 *   npx tsx scripts/seed-mcp-marketplace.ts
 *
 * Requires a valid admin userId in the database. Finds the first admin
 * user automatically, or you can pass --userId=<uuid> to override.
 */
import "dotenv/config";
import { pgDb as db } from "../src/lib/db/pg/db.pg";
import { McpServerTable, UserTable } from "../src/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";

const CURATED_SERVERS: Array<{
  name: string;
  description: string;
  category: string;
  homepageUrl: string;
  config: Record<string, unknown>;
}> = [
  {
    name: "GitHub MCP",
    description:
      "Browse repositories, manage issues, review pull requests, and explore code on GitHub directly from your AI assistant.",
    category: "Developer Tools",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    config: {
      url: "https://api.github.com",
      type: "url",
    },
  },
  {
    name: "Slack MCP",
    description:
      "Send messages, search channels, and manage conversations in Slack workspaces through natural language.",
    category: "Communication",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    config: {
      type: "url",
      url: "wss://mcp-slack.example.com",
    },
  },
  {
    name: "Filesystem MCP",
    description:
      "Read, write, and organize files on the local filesystem with full directory traversal and file manipulation.",
    category: "Utilities",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      type: "stdio",
    },
  },
  {
    name: "PostgreSQL MCP",
    description:
      "Query PostgreSQL databases, introspect schemas, and execute SQL — read-only safe for production use.",
    category: "Databases",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      type: "stdio",
    },
  },
  {
    name: "Puppeteer MCP",
    description:
      "Control a headless browser — take screenshots, extract data, fill forms, and navigate web pages programmatically.",
    category: "Browser Automation",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      type: "stdio",
    },
  },
  {
    name: "Memory MCP",
    description:
      "A persistent knowledge-graph memory system that stores and retrieves facts, entities, and relationships across sessions.",
    category: "AI & Memory",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      type: "stdio",
    },
  },
  {
    name: "Brave Search MCP",
    description:
      "Search the web using Brave Search API — returns clean, AI-friendly results with snippets and source URLs.",
    category: "Search",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      type: "stdio",
    },
  },
  {
    name: "Jira MCP",
    description:
      "Create and search issues, browse projects, and manage sprints in Jira Cloud directly from your AI assistant.",
    category: "Project Management",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/jira",
    config: {
      type: "url",
      url: "wss://mcp-jira.example.com",
    },
  },
  {
    name: "Notion MCP",
    description:
      "Read and write pages, search databases, and manage Notion workspaces through natural language requests.",
    category: "Productivity",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/notion",
    config: {
      type: "url",
      url: "wss://mcp-notion.example.com",
    },
  },
  {
    name: "Sequential Thinking MCP",
    description:
      "Break down complex problems into structured steps — think step-by-step with branching, revision, and multi-path exploration.",
    category: "AI & Memory",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/sequential-thinking",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      type: "stdio",
    },
  },
  {
    name: "Sentry MCP",
    description:
      "Query errors, investigate performance issues, and manage Sentry projects and alerts through natural language.",
    category: "Monitoring",
    homepageUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/sentry",
    config: {
      type: "url",
      url: "wss://mcp-sentry.example.com",
    },
  },
  {
    name: "Cloudflare MCP",
    description:
      "Manage Cloudflare zones, DNS records, workers, KV namespaces, and R2 buckets through natural language commands.",
    category: "Infrastructure",
    homepageUrl: "https://github.com/cloudflare/workers-mcp",
    config: {
      type: "url",
      url: "wss://mcp-cloudflare.example.com",
    },
  },
];

async function main() {
  // Find the first admin user to own the curated servers
  const [admin] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.role, "admin"))
    .limit(1);

  if (!admin) {
    console.error(
      "No admin user found. Run a user sign-up first, then re-run this seed.",
    );
    process.exit(1);
  }

  console.log(`Using admin userId: ${admin.id}`);

  let inserted = 0;
  let skipped = 0;

  for (const srv of CURATED_SERVERS) {
    // Check if already exists
    const [existing] = await db
      .select({ id: McpServerTable.id })
      .from(McpServerTable)
      .where(eq(McpServerTable.name, srv.name))
      .limit(1);

    if (existing) {
      // Update curated flag + metadata
      await db
        .update(McpServerTable)
        .set({
          curated: true,
          category: srv.category,
          description: srv.description,
          homepageUrl: srv.homepageUrl,
          visibility: "public",
          updatedAt: new Date(),
        })
        .where(eq(McpServerTable.id, existing.id));
      console.log(`  Updated: ${srv.name}`);
      skipped++;
      continue;
    }

    await db.insert(McpServerTable).values({
      name: srv.name,
      description: srv.description,
      category: srv.category,
      homepageUrl: srv.homepageUrl,
      config: srv.config as any,
      userId: admin.id,
      curated: true,
      visibility: "public",
      installCount: Math.floor(Math.random() * 100) + 10,
      enabled: true,
    });

    console.log(`  Inserted: ${srv.name}`);
    inserted++;
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
