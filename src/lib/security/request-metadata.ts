import { headers } from "next/headers";
import { parseUserAgent } from "./device-parser";
import { getAdminConfigSection } from "lib/admin/site-config-reader";
import type { RequestMetadata } from "./types";

const FALLBACK_IP_HEADER_PRIORITY = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
];
const FALLBACK_GEO_HEADER_PRIORITY = [
  "cf-ipcountry",
  "cf-ipcity",
  "x-vercel-ip-country",
];

/**
 * Extract the real client IP using trusted proxy headers.
 *
 * The header priority is read from the admin security config
 * (`security.ipHeaderPriority`). Defaults:
 *   1. cf-connecting-ip  (Cloudflare — most reliable)
 *   2. x-real-ip         (Vercel / Nginx)
 *   3. x-forwarded-for   (generic — take first entry)
 *   4. "unknown"
 */
const extractIp = (h: Headers, priority: string[]): string => {
  for (const headerName of priority) {
    const value = h.get(headerName);
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed) {
      // x-forwarded-for is a comma-separated list — leftmost is the client
      if (headerName.toLowerCase() === "x-forwarded-for") {
        const first = trimmed.split(",")[0]?.trim();
        if (first) return first;
      } else {
        return trimmed;
      }
    }
  }
  return "unknown";
};

/**
 * Extract geo-location from proxy headers.
 * Falls back to the next header in `security.geoHeaderPriority` if the
 * first one is absent. Defaults:
 *   1. cf-ipcountry / cf-ipcity  (Cloudflare)
 *   2. x-vercel-ip-country / x-vercel-ip-city  (Vercel)
 */
const extractGeo = (
  h: Headers,
  priority: string[],
): { country: string | null; city: string | null } => {
  let country: string | null = null;
  let city: string | null = null;
  for (const headerName of priority) {
    const lower = headerName.toLowerCase();
    const value = h.get(headerName);
    if (!value) continue;
    if (lower.includes("country") && country === null) {
      country = value;
    } else if (lower.includes("city") && city === null) {
      city = value;
    }
    if (country && city) break;
  }
  return { country, city };
};

/**
 * Build a full `RequestMetadata` object from the current request's headers.
 *
 * This is the single entry-point the rest of the app should use.
 * It is safe to call from API routes and server components (uses `next/headers`).
 */
export const getRequestMetadata = async (): Promise<RequestMetadata> => {
  const h = await headers();

  // Load header priority from admin security config; never let a config
  // read failure block metadata extraction.
  const security = await getAdminConfigSection("security").catch(() => null);
  const ipHeaderPriority =
    (security?.ipHeaderPriority as string[] | undefined) ??
    FALLBACK_IP_HEADER_PRIORITY;
  const geoHeaderPriority =
    (security?.geoHeaderPriority as string[] | undefined) ??
    FALLBACK_GEO_HEADER_PRIORITY;

  const ip = extractIp(h, ipHeaderPriority);
  const { country, city } = extractGeo(h, geoHeaderPriority);
  const userAgent = h.get("user-agent") || "";
  const { device, os, browser } = parseUserAgent(userAgent);
  const referer = h.get("referer") || null;

  return {
    ip,
    country,
    city,
    device,
    os,
    browser,
    userAgent,
    referer,
    timestamp: new Date().toISOString(),
  };
};
