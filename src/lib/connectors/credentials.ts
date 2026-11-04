import "server-only";
import { getAdminConfigSection } from "lib/admin/site-config-reader";
import { NEW_OAUTH_PROVIDERS, NEW_TOKEN_PROVIDERS } from "./providers-list";

/**
 * Resolves connector credentials for a user connector, preferring values
 * set in the admin panel and falling back to env vars.
 *
 * The admin panel is the recommended path for self-hosted deployments
 * because it lets an operator rotate secrets without redeploying. Env
 * vars are still supported so existing setups keep working unchanged.
 *
 * Two credential shapes are supported:
 *
 * 1. OAuth 2.0 (most providers): `{ clientId, clientSecret, tenantId? }`.
 *    Both clientId and clientSecret must be present.
 * 2. Server-side API token (token-only providers such as BookStack,
 *    GitBook, Canvas, Loopio, TestRail, Discourse, XenForo, Drupal Wiki,
 *    Axero, Zulip, MediaWiki, Fireflies). The token is read from a
 *    single env var and shared across all users of the deployment.
 *    Wikipedia needs no credential at all.
 */
export type ConnectorProvider =
  | "gmail"
  | "google-drive"
  | "google-calendar"
  | "google-docs"
  | "google-forms"
  | "google-keep"
  | "google-meet"
  | "google-sheets"
  | "google-slides"
  | "google-tasks"
  | "youtube"
  | "outlook"
  | "slack"
  | "notion"
  | "github"
  // 42 new providers added 2026-06-03. OAuth providers + token-only
  // (server-side env-var) providers + Wikipedia (no auth).
  | "confluence"
  | "jira"
  | "linear"
  | "asana"
  | "clickup"
  | "productboard"
  | "testrail"
  | "coda"
  | "outline"
  | "slab"
  | "guru"
  | "highspot"
  | "document360"
  | "gitlab"
  | "bitbucket"
  | "dropbox"
  | "zendesk"
  | "freshdesk"
  | "salesforce"
  | "hubspot"
  | "airtable"
  | "gong"
  | "egnyte"
  | "teams"
  | "discord"
  | "bookstack"
  | "gitbook"
  | "canvas"
  | "loopio"
  | "discourse"
  | "xenforo"
  | "drupal-wiki"
  | "axero"
  | "zulip"
  | "mediawiki"
  | "fireflies"
  | "wikipedia";

export type ConnectorOAuthAdminKey =
  | "google"
  | "github"
  | "microsoft"
  | "slack"
  | "notion"
  | "atlassian"
  | "linear"
  | "asana"
  | "clickup"
  | "productboard"
  | "coda"
  | "outline"
  | "slab"
  | "guru"
  | "highspot"
  | "gitlab"
  | "bitbucket"
  | "dropbox"
  | "zendesk"
  | "freshdesk"
  | "salesforce"
  | "hubspot"
  | "airtable"
  | "gong"
  | "egnyte"
  | "discord";

const OAUTH_ADMIN_KEY: Record<ConnectorProvider, ConnectorOAuthAdminKey> = {
  gmail: "google",
  "google-drive": "google",
  "google-calendar": "google",
  "google-docs": "google",
  "google-forms": "google",
  "google-keep": "google",
  "google-meet": "google",
  "google-sheets": "google",
  "google-slides": "google",
  "google-tasks": "google",
  youtube: "google",
  outlook: "microsoft",
  slack: "slack",
  notion: "notion",
  github: "github",
  // New OAuth providers
  confluence: "atlassian",
  jira: "atlassian",
  linear: "linear",
  asana: "asana",
  clickup: "clickup",
  productboard: "productboard",
  testrail: "asana", // fallback; not in OAUTH_ADMIN_KEY list — see testrail-token
  coda: "coda",
  outline: "outline",
  slab: "slab",
  guru: "guru",
  highspot: "highspot",
  document360: "highspot", // testrail/document360 don't have OAuth admin keys — see notes
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  dropbox: "dropbox",
  zendesk: "zendesk",
  freshdesk: "freshdesk",
  salesforce: "salesforce",
  hubspot: "hubspot",
  airtable: "airtable",
  gong: "gong",
  egnyte: "egnyte",
  teams: "microsoft",
  discord: "discord",
  // Token-only providers — the admin key is irrelevant since they don't
  // use OAuth. Reuse the closest existing key to satisfy the type.
  bookstack: "google",
  gitbook: "google",
  canvas: "google",
  loopio: "google",
  discourse: "google",
  xenforo: "google",
  "drupal-wiki": "google",
  axero: "google",
  zulip: "google",
  mediawiki: "google",
  fireflies: "google",
  wikipedia: "google",
};

const OAUTH_ENV_VARS: Record<
  ConnectorProvider,
  { clientId: string; clientSecret: string; tenantId?: string }
> = {
  gmail: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-drive": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-calendar": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-docs": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-forms": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-keep": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-meet": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-sheets": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-slides": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  "google-tasks": {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  youtube: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  outlook: {
    clientId: "MICROSOFT_CLIENT_ID",
    clientSecret: "MICROSOFT_CLIENT_SECRET",
    tenantId: "MICROSOFT_TENANT_ID",
  },
  slack: {
    clientId: "SLACK_CLIENT_ID",
    clientSecret: "SLACK_CLIENT_SECRET",
  },
  notion: {
    clientId: "NOTION_CLIENT_ID",
    clientSecret: "NOTION_CLIENT_SECRET",
  },
  github: {
    clientId: "GITHUB_CLIENT_ID",
    clientSecret: "GITHUB_CLIENT_SECRET",
  },
  // New OAuth providers — env-var defaults
  confluence: {
    clientId: "CONFLUENCE_CLIENT_ID",
    clientSecret: "CONFLUENCE_CLIENT_SECRET",
  },
  jira: {
    clientId: "JIRA_CLIENT_ID",
    clientSecret: "JIRA_CLIENT_SECRET",
  },
  linear: {
    clientId: "LINEAR_CLIENT_ID",
    clientSecret: "LINEAR_CLIENT_SECRET",
  },
  asana: {
    clientId: "ASANA_CLIENT_ID",
    clientSecret: "ASANA_CLIENT_SECRET",
  },
  clickup: {
    clientId: "CLICKUP_CLIENT_ID",
    clientSecret: "CLICKUP_CLIENT_SECRET",
  },
  productboard: {
    clientId: "PRODUCTBOARD_CLIENT_ID",
    clientSecret: "PRODUCTBOARD_CLIENT_SECRET",
  },
  testrail: {
    clientId: "TESTRAIL_API_TOKEN",
    clientSecret: "TESTRAIL_API_TOKEN",
  },
  coda: {
    clientId: "CODA_CLIENT_ID",
    clientSecret: "CODA_CLIENT_SECRET",
  },
  outline: {
    clientId: "OUTLINE_CLIENT_ID",
    clientSecret: "OUTLINE_CLIENT_SECRET",
  },
  slab: {
    clientId: "SLAB_CLIENT_ID",
    clientSecret: "SLAB_CLIENT_SECRET",
  },
  guru: {
    clientId: "GURU_CLIENT_ID",
    clientSecret: "GURU_CLIENT_SECRET",
  },
  highspot: {
    clientId: "HIGHSPOT_CLIENT_ID",
    clientSecret: "HIGHSPOT_CLIENT_SECRET",
  },
  document360: {
    clientId: "DOCUMENT360_API_TOKEN",
    clientSecret: "DOCUMENT360_API_TOKEN",
  },
  gitlab: {
    clientId: "GITLAB_CLIENT_ID",
    clientSecret: "GITLAB_CLIENT_SECRET",
  },
  bitbucket: {
    clientId: "BITBUCKET_CLIENT_ID",
    clientSecret: "BITBUCKET_CLIENT_SECRET",
  },
  dropbox: {
    clientId: "DROPBOX_CLIENT_ID",
    clientSecret: "DROPBOX_CLIENT_SECRET",
  },
  zendesk: {
    clientId: "ZENDESK_CLIENT_ID",
    clientSecret: "ZENDESK_CLIENT_SECRET",
  },
  freshdesk: {
    clientId: "FRESHDESK_CLIENT_ID",
    clientSecret: "FRESHDESK_CLIENT_SECRET",
  },
  salesforce: {
    clientId: "SALESFORCE_CLIENT_ID",
    clientSecret: "SALESFORCE_CLIENT_SECRET",
  },
  hubspot: {
    clientId: "HUBSPOT_CLIENT_ID",
    clientSecret: "HUBSPOT_CLIENT_SECRET",
  },
  airtable: {
    clientId: "AIRTABLE_CLIENT_ID",
    clientSecret: "AIRTABLE_CLIENT_SECRET",
  },
  gong: {
    clientId: "GONG_CLIENT_ID",
    clientSecret: "GONG_CLIENT_SECRET",
  },
  egnyte: {
    clientId: "EGNYTE_CLIENT_ID",
    clientSecret: "EGNYTE_CLIENT_SECRET",
  },
  teams: {
    clientId: "MICROSOFT_CLIENT_ID",
    clientSecret: "MICROSOFT_CLIENT_SECRET",
    tenantId: "MICROSOFT_TENANT_ID",
  },
  discord: {
    clientId: "DISCORD_CLIENT_ID",
    clientSecret: "DISCORD_CLIENT_SECRET",
  },
  // Token-only providers — env var holds the API token directly.
  // ClientId/ClientSecret are both set to the same env var so that
  // getConnectorCredentials returns a non-null result when the token is set.
  bookstack: {
    clientId: "BOOKSTACK_API_TOKEN",
    clientSecret: "BOOKSTACK_API_TOKEN",
  },
  gitbook: {
    clientId: "GITBOOK_API_TOKEN",
    clientSecret: "GITBOOK_API_TOKEN",
  },
  canvas: {
    clientId: "CANVAS_API_TOKEN",
    clientSecret: "CANVAS_API_TOKEN",
  },
  loopio: {
    clientId: "LOOPIO_API_TOKEN",
    clientSecret: "LOOPIO_API_TOKEN",
  },
  discourse: {
    clientId: "DISCOURSE_API_TOKEN",
    clientSecret: "DISCOURSE_API_TOKEN",
  },
  xenforo: {
    clientId: "XENFORO_API_KEY",
    clientSecret: "XENFORO_API_KEY",
  },
  "drupal-wiki": {
    clientId: "DRUPAL_WIKI_API_TOKEN",
    clientSecret: "DRUPAL_WIKI_API_TOKEN",
  },
  axero: {
    clientId: "AXERO_API_TOKEN",
    clientSecret: "AXERO_API_TOKEN",
  },
  zulip: {
    clientId: "ZULIP_API_TOKEN",
    clientSecret: "ZULIP_API_TOKEN",
  },
  mediawiki: {
    clientId: "MEDIAWIKI_API_TOKEN",
    clientSecret: "MEDIAWIKI_API_TOKEN",
  },
  fireflies: {
    clientId: "FIREFLIES_API_KEY",
    clientSecret: "FIREFLIES_API_KEY",
  },
  wikipedia: {
    // Wikipedia is public; an empty env var resolves to a synthetic
    // credential so isProviderConfigured returns true.
    clientId: "WIKIPEDIA_USER_AGENT",
    clientSecret: "WIKIPEDIA_USER_AGENT",
  },
};

/**
 * Providers that don't have user-level OAuth. The connector DB row is just a
 * `isConnected=true` flag and `getAccessToken` reads from server env.
 */
export const TOKEN_ONLY_PROVIDERS: ReadonlySet<ConnectorProvider> = new Set([
  ...NEW_TOKEN_PROVIDERS,
]);

/** Providers that need no credential at all. */
export const NO_AUTH_PROVIDERS: ReadonlySet<ConnectorProvider> = new Set([
  "wikipedia",
]);

/**
 * Providers that use the user-level OAuth flow (authorize + callback route).
 * Used by /api/connectors/route.ts to decide which catalog entries should
 * have connect routes vs. which are auto-available because they're
 * server-token / no-auth.
 */
export const OAUTH_PROVIDERS: ReadonlySet<ConnectorProvider> = new Set([
  // Original 7 + Google Workspace + YouTube
  "gmail",
  "google-drive",
  "google-calendar",
  "google-docs",
  "google-forms",
  "google-keep",
  "google-meet",
  "google-sheets",
  "google-slides",
  "google-tasks",
  "youtube",
  "outlook",
  "slack",
  "notion",
  "github",
  // New OAuth providers
  ...NEW_OAUTH_PROVIDERS,
]);

export interface ConnectorCredentials {
  clientId: string;
  clientSecret: string;
  /** Microsoft-only: tenant ID. Defaults to "common" if not set. */
  tenantId?: string;
}

export async function getConnectorCredentials(
  provider: ConnectorProvider,
): Promise<ConnectorCredentials | null> {
  const envMap = OAUTH_ENV_VARS[provider];
  const adminKey = OAUTH_ADMIN_KEY[provider];
  const oauth = await getAdminConfigSection("oauth");
  // The admin config shape is deep-merged over defaults, so a stale
  // DB row may be missing some keys; treat each field as optional.
  const adminProvider = (oauth.providers ?? {})[adminKey] as
    | (Record<string, unknown> & {
        clientId?: string;
        clientSecret?: string;
        tenantId?: string;
      })
    | undefined;

  const clientId =
    (adminProvider?.clientId && adminProvider.clientId.trim()) ||
    process.env[envMap.clientId] ||
    "";
  const clientSecret =
    (adminProvider?.clientSecret && adminProvider.clientSecret.trim()) ||
    process.env[envMap.clientSecret] ||
    "";
  const tenantId =
    (adminProvider?.tenantId && adminProvider.tenantId.trim()) ||
    (envMap.tenantId ? process.env[envMap.tenantId] : undefined) ||
    "common";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenantId };
}

export async function isProviderConfigured(
  provider: ConnectorProvider,
): Promise<boolean> {
  // No-auth providers are always "configured" — the public API needs no key.
  if (NO_AUTH_PROVIDERS.has(provider)) return true;
  return (await getConnectorCredentials(provider)) !== null;
}

/**
 * Returns the server-side API token for a token-only provider. Returns null
 * if the env var is not set. For Wikipedia, returns a synthetic token
 * (`"anonymous"`) since the public REST API requires no auth (only a
 * descriptive User-Agent header, which the per-provider tool sets).
 */
export function getTokenProviderToken(
  provider: ConnectorProvider,
): string | null {
  if (provider === "wikipedia") {
    return "anonymous";
  }
  if (!TOKEN_ONLY_PROVIDERS.has(provider)) return null;
  const envVar = OAUTH_ENV_VARS[provider].clientId;
  const value = process.env[envVar]?.trim();
  return value && value.length > 0 ? value : null;
}
