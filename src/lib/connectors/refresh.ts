/**
 * Provider-aware token refresh + revoke helpers for user connectors.
 *
 * - `refreshConnectorToken` returns a fresh access token if the stored one
 *   is expired (or about to expire) and persists the new token to the DB.
 *   Returns `null` on failure so the caller can surface a reconnect message.
 * - `revokeConnectorToken` calls each provider's revoke endpoint when the
 *   user disconnects. Providers that don't expose a revoke endpoint (Notion)
 *   return success so the caller still proceeds with the local DB cleanup.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { getConnectorCredentials } from "./credentials";

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
  // 42 new providers added 2026-06-03. Their refresh behavior is decided
  // in the switch below. Token-only providers never reach this function
  // (their tools read directly from env via `getTokenProviderToken`).
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

type ConnectorRow = typeof UserConnectorTable.$inferSelect;

/**
 * Returns a usable access token. Refreshes the token if expired and a
 * refresh token is available. Returns `null` when refresh isn't possible
 * (caller should ask the user to reconnect).
 */
export async function refreshConnectorToken(
  provider: ConnectorProvider,
  connector: ConnectorRow,
): Promise<string | null> {
  // Token still valid — return as-is.
  if (!connector.tokenExpiresAt || connector.tokenExpiresAt > new Date()) {
    return connector.accessToken || null;
  }

  if (!connector.refreshToken) {
    console.error(`[${provider}] refresh failed: no refresh_token stored`);
    return null;
  }

  switch (provider) {
    case "gmail":
    case "google-drive":
    case "google-calendar":
    case "google-docs":
    case "google-forms":
    case "google-keep":
    case "google-meet":
    case "google-sheets":
    case "google-slides":
    case "google-tasks":
    case "youtube": {
      const creds = await getConnectorCredentials(provider);
      if (!creds) return null;
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: connector.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      return persistGoogleRefresh(provider, connector, res);
    }
    case "outlook":
    case "teams": {
      const creds = await getConnectorCredentials("outlook");
      if (!creds) return null;
      const tenant = creds.tenantId || "common";
      // Teams and Outlook share the same Microsoft OAuth tenant and refresh
      // endpoint. Outlook's scope set is the original; Teams uses Chat scopes.
      const isTeams = provider === "teams";
      const scope = isTeams
        ? "offline_access Chat.Read Chat.ReadWrite User.Read"
        : "offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";
      const res = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: connector.refreshToken,
            grant_type: "refresh_token",
            scope,
          }),
        },
      );
      return persistMicrosoftRefresh(provider, connector, res);
    }
    // Atlassian Cloud (Confluence, Jira) uses the same OAuth 2.0 refresh
    // endpoint with audience=api.atlassian.com.
    case "confluence":
    case "jira": {
      const creds = await getConnectorCredentials(provider);
      if (!creds) return null;
      const res = await fetch("https://auth.atlassian.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: connector.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      return persistGenericRefresh(provider, connector, res);
    }
    // Zendesk, Freshdesk, Salesforce, HubSpot, Gong all use standard OAuth 2.0
    // refresh with their own token endpoints.
    case "zendesk": {
      const creds = await getConnectorCredentials("zendesk");
      if (!creds) return null;
      const subdomain = process.env.ZENDESK_SUBDOMAIN || "";
      if (!subdomain) {
        console.error("[zendesk] refresh failed: ZENDESK_SUBDOMAIN not set");
        return null;
      }
      const res = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: connector.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      return persistGenericRefresh(provider, connector, res);
    }
    case "freshdesk": {
      const creds = await getConnectorCredentials("freshdesk");
      if (!creds) return null;
      const subdomain = process.env.FRESHDESK_SUBDOMAIN || "";
      if (!subdomain) {
        console.error(
          "[freshdesk] refresh failed: FRESHDESK_SUBDOMAIN not set",
        );
        return null;
      }
      const res = await fetch(
        `https://${subdomain}.freshdesk.com/oauth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: connector.refreshToken,
            grant_type: "refresh_token",
          }),
        },
      );
      return persistGenericRefresh(provider, connector, res);
    }
    case "salesforce": {
      const creds = await getConnectorCredentials("salesforce");
      if (!creds) return null;
      const loginUrl =
        process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
      const res = await fetch(`${loginUrl}/services/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: connector.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      return persistGenericRefresh(provider, connector, res);
    }
    case "hubspot": {
      const creds = await getConnectorCredentials("hubspot");
      if (!creds) return null;
      const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: connector.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      return persistGenericRefresh(provider, connector, res);
    }
    case "gong": {
      const creds = await getConnectorCredentials("gong");
      if (!creds) return null;
      const res = await fetch(
        "https://app.gong.io/oauth2/generate-access-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: connector.refreshToken,
            grant_type: "refresh_token",
          }),
        },
      );
      return persistGenericRefresh(provider, connector, res);
    }
    // All other new providers use long-lived user tokens without a standard
    // refresh flow. Returning the existing access token (or null if it's
    // missing) is the correct behavior.
    case "slack":
    case "notion":
    case "github":
    case "linear":
    case "asana":
    case "clickup":
    case "productboard":
    case "coda":
    case "outline":
    case "slab":
    case "guru":
    case "highspot":
    case "gitlab":
    case "bitbucket":
    case "dropbox":
    case "airtable":
    case "egnyte":
    case "discord":
    // Token-only / no-auth providers — refresh should not be called for
    // them, but include them so the switch is exhaustive.
    case "testrail":
    case "document360":
    case "bookstack":
    case "gitbook":
    case "canvas":
    case "loopio":
    case "discourse":
    case "xenforo":
    case "drupal-wiki":
    case "axero":
    case "zulip":
    case "mediawiki":
    case "fireflies":
    case "wikipedia":
      return connector.accessToken || null;
  }
}

/**
 * Generic JSON-token refresh: reads `access_token` + `expires_in` from the
 * response and persists. Used for providers that don't follow the Google/
 * Microsoft refresh response shape.
 */
async function persistGenericRefresh(
  provider: ConnectorProvider,
  connector: ConnectorRow,
  res: Response,
): Promise<string | null> {
  if (!res.ok) {
    console.error(
      `[${provider}] token refresh failed:`,
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }
  const tokens = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token) return null;
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  await db
    .update(UserConnectorTable)
    .set({
      accessToken: tokens.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(UserConnectorTable.id, connector.id));
  return tokens.access_token;
}

async function persistGoogleRefresh(
  provider: ConnectorProvider,
  connector: ConnectorRow,
  res: Response,
): Promise<string | null> {
  if (!res.ok) {
    console.error(`[${provider}] Google token refresh failed:`, res.status);
    return null;
  }
  const tokens = await res.json();
  if (!tokens.access_token) return null;
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  await db
    .update(UserConnectorTable)
    .set({
      accessToken: tokens.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(UserConnectorTable.id, connector.id));
  return tokens.access_token;
}

async function persistMicrosoftRefresh(
  provider: ConnectorProvider,
  connector: ConnectorRow,
  res: Response,
): Promise<string | null> {
  if (!res.ok) {
    console.error(`[${provider}] Microsoft token refresh failed:`, res.status);
    return null;
  }
  const tokens = await res.json();
  if (!tokens.access_token) return null;
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  await db
    .update(UserConnectorTable)
    .set({
      accessToken: tokens.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(UserConnectorTable.id, connector.id));
  return tokens.access_token;
}

/**
 * Best-effort token revocation. Never throws — callers should always proceed
 * with the local DB cleanup regardless of the revoke response.
 */
export async function revokeConnectorToken(
  provider: ConnectorProvider,
  accessToken: string,
): Promise<void> {
  try {
    switch (provider) {
      case "gmail":
      case "google-drive":
      case "google-calendar":
      case "google-docs":
      case "google-forms":
      case "google-keep":
      case "google-meet":
      case "google-sheets":
      case "google-slides":
      case "google-tasks":
      case "youtube":
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${accessToken}`,
          { method: "POST" },
        );
        return;
      case "outlook": {
        const creds = await getConnectorCredentials("outlook");
        const tenant = creds?.tenantId || "common";
        await fetch(
          `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/revoke?token=${encodeURIComponent(accessToken)}`,
          { method: "POST" },
        );
        return;
      }
      case "slack":
        await fetch(`https://slack.com/api/auth.revoke?token=${accessToken}`);
        return;
      case "github":
        if (provider === "github") {
          const creds = await getConnectorCredentials("github");
          if (creds) {
            const basic = Buffer.from(
              `${creds.clientId}:${creds.clientSecret}`,
            ).toString("base64");
            await fetch(
              `https://api.github.com/applications/${creds.clientId}/token`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Basic ${basic}`,
                  "Content-Type": "application/json",
                  Accept: "application/vnd.github+json",
                  "User-Agent": "flare-connector",
                },
                body: JSON.stringify({ access_token: accessToken }),
              },
            );
          }
        }
        return;
      // Notion has no public revoke endpoint; user must remove the
      // integration from their workspace settings. We just clear the token.
      case "notion":
        return;
      // Atlassian Cloud revoke — documented at
      // https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#2--authorization-code-grant-(3lo)
      case "confluence":
      case "jira":
        await fetch(
          `https://auth.atlassian.com/oauth/token/revoke?token=${encodeURIComponent(accessToken)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );
        return;
      // Microsoft Teams shares the outlook revoke endpoint.
      case "teams": {
        const creds = await getConnectorCredentials("outlook");
        const tenant = creds?.tenantId || "common";
        await fetch(
          `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/revoke?token=${encodeURIComponent(accessToken)}`,
          { method: "POST" },
        );
        return;
      }
      // Long-lived user tokens — best-effort revoke. The provider's own
      // "Disconnect" / "Revoke" settings page is the source of truth, so
      // we just call a generic revoke endpoint when one is documented and
      // otherwise silently succeed.
      case "linear":
        // Linear OAuth 2.0 — https://developers.linear.app/docs/oauth/authentication
        await fetch("https://api.linear.app/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: accessToken }),
        });
        return;
      case "asana":
        await fetch("https://app.asana.com/-/oauth_revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: accessToken }),
        });
        return;
      case "dropbox":
        await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: accessToken }),
        });
        return;
      case "airtable":
        await fetch("https://airtable.com/oauth2/v1/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: accessToken }),
        });
        return;
      case "gitlab":
        // GitLab's revoke endpoint is per-app under /oauth/revoke
        await fetch("https://gitlab.com/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: accessToken }),
        });
        return;
      case "bitbucket":
        // Bitbucket's revoke endpoint is per-workspace; users must revoke
        // from their Bitbucket account settings. No-op here.
        return;
      case "hubspot":
        await fetch(
          "https://api.hubapi.com/oauth/v1/refresh-tokens/" + accessToken,
          {
            method: "DELETE",
          },
        );
        return;
      case "zendesk":
      case "freshdesk":
      case "salesforce":
      case "gong":
        // These providers require admin/UI-based revoke; no public endpoint.
        return;
      case "clickup":
      case "productboard":
      case "coda":
      case "outline":
      case "slab":
      case "guru":
      case "highspot":
      case "egnyte":
      case "discord":
        // No public token-revoke endpoint. User must disconnect via
        // provider's connected-apps UI.
        return;
      // Token-only / no-auth providers — disconnect just clears the DB row;
      // nothing to revoke server-side.
      case "testrail":
      case "document360":
      case "bookstack":
      case "gitbook":
      case "canvas":
      case "loopio":
      case "discourse":
      case "xenforo":
      case "drupal-wiki":
      case "axero":
      case "zulip":
      case "mediawiki":
      case "fireflies":
      case "wikipedia":
        return;
    }
  } catch (err) {
    console.error(`[${provider}] token revoke failed:`, err);
  }
}
