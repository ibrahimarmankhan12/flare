// ---------------------------------------------------------------------------
// SSRF guard for user-supplied webhook URLs.
//
// Webhook subscriptions are created by end users and later fetched
// server-side by the delivery worker. Without validation a subscriber can
// point at loopback / private-network / link-local (cloud metadata)
// addresses and turn the platform into an SSRF proxy.
//
// NOTE: intentionally no `import "server-only"` — this module is a pure
// utility that unit tests load directly; all its callers are server-side.
//
// `assertPublicHttpUrl` enforces:
//   - https scheme only (http would leak signatures in transit)
//   - hostname resolves via DNS to a public unicast address
//   - rejects credentials-in-URL, non-standard ports are allowed but the
//     IP checks still apply to whatever the name resolves to
//
// It is used BOTH when a subscription is registered and immediately before
// every delivery attempt, so a DNS rebinding or stale allowlisted record
// cannot slip through.
// ---------------------------------------------------------------------------

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlBlockedError";
  }
}

const isPrivateIpv4 = (b: number[]): boolean => {
  // 0.0.0.0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12,
  // 192.0.0/24, 192.168/16, 198.18/15, 240/4 (reserved), 255.255.255.255
  const [a, b2] = b;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b2 >= 64 && b2 <= 127) return true;
  if (a === 169 && b2 === 254) return true;
  if (a === 172 && b2 >= 16 && b2 <= 31) return true;
  if (a === 192 && b2 === 0) return true;
  if (a === 192 && b2 === 168) return true;
  if (a === 198 && (b2 === 18 || b2 === 19)) return true;
  if (a >= 240) return true;
  return false;
};

const isPrivateIpv6 = (groups: string[]): boolean => {
  const lower = groups.join(":").toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified / loopback
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  )
    return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  // IPv4-mapped (::ffff:0:0/96) — re-check the embedded v4.
  const mapped = lower.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const parts = mapped[1].split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) {
      return isPrivateIpv4(parts);
    }
  }
  return false;
};

const isPrivateAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address.split(".").map(Number));
  }
  if (family === 6) {
    return isPrivateIpv6(address.split(":"));
  }
  return true; // unparseable → treat as unsafe
};

/**
 * Validate that `raw` is an https URL whose host currently resolves to a
 * public address. Throws UrlBlockedError with a safe message on failure.
 */
export const assertPublicWebhookUrl = async (raw: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlBlockedError("Invalid webhook URL");
  }

  if (url.protocol !== "https:") {
    throw new UrlBlockedError("Webhook URL must use https");
  }
  if (url.username || url.password) {
    throw new UrlBlockedError("Webhook URL must not contain credentials");
  }

  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlBlockedError("Webhook host does not resolve");
  }

  if (addresses.length === 0) {
    throw new UrlBlockedError("Webhook host does not resolve");
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UrlBlockedError(
        "Webhook host resolves to a non-public address",
      );
    }
  }

  return url;
};
