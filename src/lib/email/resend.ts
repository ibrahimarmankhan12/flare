import { Resend } from "resend";
import { headers } from "next/headers";
import logger from "logger";
import { getAdminConfigSection } from "lib/admin/site-config-reader";

/**
 * Region -> env-var name mapping. The defaults below are the historical
 * hardcoded mapping; admins can override the env-var names per region
 * from the admin panel (Email settings) without a code change.
 */
const FALLBACK_REGION_API_KEY_ENV: Record<string, string> = {
  US: "RESEND_API_KEY_US",
  IN: "RESEND_API_KEY_IN",
  CN: "RESEND_API_KEY_CHIN",
  EU: "RESEND_API_KEY_EU",
  AU: "RESEND_API_KEY_AUSTRALIA",
  SG: "RESEND_API_KEY_SINGAPORE",
  BR: "RESEND_API_KEY_BRAZIL",
};

const FALLBACK_EU_COUNTRIES = [
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "BE",
  "SE",
  "DK",
  "FI",
  "IE",
  "PL",
  "AT",
  "CZ",
];

const FALLBACK_DISPLAY_NAMES: Record<string, string> = {
  security: "Flare Security",
  auth: "Flare",
  noreply: "Flare",
  payments: "Flare Payments",
};

const FALLBACK_REGION_DOMAIN = "flare-sh.tech";
const FALLBACK_DEFAULT_COUNTRY = "US";

/**
 * Resolve the Resend API key for a given region by looking up the
 * env var name from the admin email config and reading it from `process.env`.
 */
const resolveApiKey = (
  region: string,
  regionApiKeyEnv: Record<string, string>,
): string | undefined => {
  const envName = regionApiKeyEnv[region];
  if (!envName) return undefined;
  return process.env[envName];
};

export const getResendClient = async () => {
  const emailConfig = await getAdminConfigSection("email").catch(() => null);
  const regionApiKeyEnv =
    (emailConfig?.regionApiKeyEnv as Record<string, string> | undefined) ??
    FALLBACK_REGION_API_KEY_ENV;
  const euCountries =
    (emailConfig?.euCountries as string[] | undefined) ?? FALLBACK_EU_COUNTRIES;
  const defaultCountry =
    (emailConfig?.defaultCountry as string | undefined) ??
    FALLBACK_DEFAULT_COUNTRY;
  const regionDomain =
    (emailConfig?.regionDomain as string | undefined) ?? FALLBACK_REGION_DOMAIN;
  const enabled = (emailConfig?.enabled as boolean | undefined) ?? true;

  const reqHeaders = await headers();
  const countryCode = reqHeaders.get("x-vercel-ip-country") || defaultCountry;

  // Try to find the exact country code, or fallback to default
  let apiKey = resolveApiKey(countryCode, regionApiKeyEnv);
  let region = countryCode.toLowerCase();

  // If no specific API key for this country, check EU bucket then default
  if (!apiKey) {
    if (euCountries.includes(countryCode)) {
      apiKey = resolveApiKey("EU", regionApiKeyEnv);
      region = "eu";
    } else {
      apiKey = resolveApiKey(defaultCountry, regionApiKeyEnv);
      region = defaultCountry.toLowerCase();
    }
  }

  // Final fallback to first available key if something is missing
  if (!apiKey) {
    apiKey = Object.keys(regionApiKeyEnv)
      .map((r) => resolveApiKey(r, regionApiKeyEnv))
      .find((key) => !!key);
  }

  if (!enabled) {
    logger.warn(
      "Email sending is disabled by admin configuration. Skipping Resend client init.",
    );
    return { resend: null, domain: "", country: countryCode };
  }

  if (!apiKey) {
    logger.warn("No Resend API keys configured!");
  }

  return {
    resend: apiKey ? new Resend(apiKey) : null,
    domain: apiKey ? `${region}.${regionDomain}` : regionDomain,
    country: countryCode,
  };
};

// Re-export request metadata from the security module so existing
// callers (email templates, auth hooks) keep working without changing imports.
export { getRequestMetadata as getRequestTrackingInfo } from "lib/security/request-metadata";

export const sendEmail = async ({
  to,
  subject,
  html,
  from = "noreply",
}: {
  to: string;
  subject: string;
  html: string;
  /** Sender prefix — maps to `prefix@{region}.{regionDomain}` */
  from?: "security" | "auth" | "noreply" | "payments";
}) => {
  try {
    const emailConfig = await getAdminConfigSection("email").catch(() => null);
    const enabled = (emailConfig?.enabled as boolean | undefined) ?? true;
    if (!enabled) {
      logger.info(
        `Email sending is disabled by admin config — skipped email to ${to} (${subject})`,
      );
      return;
    }

    const { resend, domain } = await getResendClient();
    if (!resend) return;

    const displayNames: Record<string, string> = {
      ...FALLBACK_DISPLAY_NAMES,
      ...((emailConfig?.displayNames as Record<string, string> | undefined) ??
        {}),
    };

    await resend.emails.send({
      from: `${displayNames[from] ?? FALLBACK_DISPLAY_NAMES[from] ?? "Flare"} <${from}@${domain}>`,
      to,
      subject,
      html,
    });

    logger.info(`Email sent to ${to} from ${from}@${domain}`);
  } catch (error) {
    logger.error("Failed to send email:", error);
  }
};
