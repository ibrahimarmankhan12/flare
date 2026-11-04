import { MetadataRoute } from "next";
import { pgDb } from "lib/db/pg/db.pg";
import { AgentTable } from "lib/db/pg/schema.pg";
import { eq, desc } from "drizzle-orm";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

type SitemapEntry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  lastModified?: Date;
};

const staticEntries: SitemapEntry[] = [
  {
    path: "/",
    changeFrequency: "daily",
    priority: 1.0,
    lastModified: new Date(),
  },
  {
    path: "/about",
    changeFrequency: "monthly",
    priority: 0.9,
    lastModified: new Date(),
  },
  {
    path: "/plans",
    changeFrequency: "weekly",
    priority: 0.9,
    lastModified: new Date(),
  },
  {
    path: "/gallery/agents",
    changeFrequency: "daily",
    priority: 0.9,
    lastModified: new Date(),
  },
  {
    path: "/marketplace/mcp",
    changeFrequency: "daily",
    priority: 0.8,
    lastModified: new Date(),
  },
  {
    path: "/bug-bounty",
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: new Date(),
  },
  {
    path: "/privacy-policy",
    changeFrequency: "yearly",
    priority: 0.5,
    lastModified: new Date("2026-01-15"),
  },
  {
    path: "/terms-of-service",
    changeFrequency: "yearly",
    priority: 0.5,
    lastModified: new Date("2026-01-15"),
  },
  {
    path: "/cookies-policy",
    changeFrequency: "yearly",
    priority: 0.3,
    lastModified: new Date("2026-01-15"),
  },
  {
    path: "/refund-policy",
    changeFrequency: "yearly",
    priority: 0.3,
    lastModified: new Date("2026-01-15"),
  },
];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls = staticEntries.map((entry) => ({
    url: `${siteUrl}${entry.path}`,
    lastModified: entry.lastModified ?? new Date(),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  // Dynamic: public agent gallery pages
  let agentUrls: MetadataRoute.Sitemap = [];
  try {
    const agents = await pgDb
      .select({
        id: AgentTable.id,
        updatedAt: AgentTable.updatedAt,
      })
      .from(AgentTable)
      .where(eq(AgentTable.visibility, "public"))
      .orderBy(desc(AgentTable.createdAt))
      .limit(500);

    agentUrls = agents.map((agent) => ({
      url: `${siteUrl}/gallery/agents/${agent.id}`,
      lastModified: agent.updatedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // If DB query fails (e.g. build time), return static only
  }

  return [...staticUrls, ...agentUrls];
}
