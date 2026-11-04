import { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/plans",
          "/gallery/agents",
          "/marketplace/mcp",
          "/bug-bounty",
          "/privacy-policy",
          "/terms-of-service",
          "/cookies-policy",
          "/refund-policy",
          "/export/",
        ],
        disallow: [
          "/api/",
          "/admin/",
          "/archive/",
          "/workflow/",
          "/mcp/setup",
          "/chat/",
          "/sign-in",
          "/sign-up",
          "/sign-up/",
          "/auth",
          "/landing",
          "/embed/",
          "/dashboard/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
