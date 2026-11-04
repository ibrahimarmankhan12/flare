import { readFileSync } from "fs";
import { join } from "path";
import type { RequestMetadata } from "lib/security/types";

// ── Template loader ─────────────────────────────────────────────────

const TEMPLATE_DIR = join(process.cwd(), "email-tems");

const templateCache = new Map<string, string>();

const loadTemplate = (filename: string): string => {
  const cached = templateCache.get(filename);
  if (cached) return cached;

  const filePath = join(TEMPLATE_DIR, filename);
  const html = readFileSync(filePath, "utf-8");
  templateCache.set(filename, html);
  return html;
};

// ── Placeholder substitution ────────────────────────────────────────

const replacePlaceholders = (
  html: string,
  placeholders: Record<string, string>,
): string => {
  let result = html;
  for (const [key, value] of Object.entries(placeholders)) {
    // Replace all occurrences of the placeholder
    result = result.replaceAll(key, value);
  }
  return result;
};

/** Human-readable device string from parsed metadata. */
const formatDevice = (meta: RequestMetadata): string =>
  `${meta.browser} on ${meta.os} (${meta.device})`;

/** Human-readable location string. */
const formatRegion = (meta: RequestMetadata): string => {
  const parts = [meta.city, meta.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Unknown";
};

// ── Public template builders ────────────────────────────────────────

/**
 * Welcome email sent after user signs up.
 * Placeholders: [First Name], [user email], [region], [device]
 */
export const getWelcomeEmailHtml = (
  name: string,
  email: string,
  tracking: RequestMetadata,
): string => {
  const html = loadTemplate("welcome-email.html");
  return replacePlaceholders(html, {
    "[First Name]": name,
    "[user email]": email,
    "[region]": formatRegion(tracking),
    "[device]": formatDevice(tracking),
  });
};

/**
 * New-login alert email.
 * Placeholders: [First Name], [user email], [region], [device]
 */
export const getLoginAlertEmailHtml = (
  name: string,
  email: string,
  tracking: RequestMetadata,
): string => {
  const html = loadTemplate("new-login-alert.html");
  return replacePlaceholders(html, {
    "[First Name]": name,
    "[user email]": email,
    "[region]": formatRegion(tracking),
    "[device]": formatDevice(tracking),
  });
};

/**
 * Subscription / account upgrade email.
 * Placeholders: [First Name], [plan_name]
 */
export const getSubscriptionEmailHtml = (
  name: string,
  planName: string,
): string => {
  const html = loadTemplate("flare-subscription-email.html");
  return replacePlaceholders(html, {
    "[First Name]": name,
    "[plan_name]": planName,
  });
};

/**
 * Policy update email.
 * Placeholders: [First Name]
 */
export const getPolicyUpdateEmailHtml = (name: string): string => {
  const html = loadTemplate("flare-policy-update-email.html");
  return replacePlaceholders(html, {
    "[First Name]": name,
  });
};

/**
 * Account deactivated / banned email.
 * Placeholders: [First Name]
 */
export const getAccountDeactivatedEmailHtml = (name: string): string => {
  const html = loadTemplate("flare-account-deactivated-email.html");
  return replacePlaceholders(html, {
    "[First Name]": name,
  });
};
