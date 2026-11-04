import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/confluence/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/confluence/callback`;
}

interface AtlassianTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

type AtlassianAccessibleResourcesResponse = Array<{
  id: string;
  name: string;
  url: string;
  scopes: string[];
}>;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        error,
        "confluence",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        "Missing authorization code or state",
        "confluence",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        "Invalid state parameter",
        "confluence",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        "Authorization expired. Please try again.",
        "confluence",
      );
    }
    const creds = await getConnectorCredentials("confluence");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        "Confluence integration is not properly configured",
        "confluence",
      );
    }

    const redirectUri = getRedirectUri(request);

    const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        "Failed to exchange authorization code",
        "confluence",
      );
    }
    const tokens = (await tokenRes.json()) as AtlassianTokenResponse;
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "Confluence Connection Failed",
        tokens.error_description || "Atlassian did not return an access token",
        "confluence",
      );
    }

    // Resolve the cloud ID (Atlassian multi-tenant model).
    const resourcesRes = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    const resources =
      (await resourcesRes.json()) as AtlassianAccessibleResourcesResponse;
    const confluenceResource =
      resources.find((r) => r.scopes.some((s) => s.includes("confluence"))) ||
      resources[0];
    const cloudId = confluenceResource?.id;
    const workspaceName = confluenceResource?.name || "Confluence";

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "confluence",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          email: null,
          metadata: {
            cloudId,
            workspaceName,
            resourceUrl: confluenceResource?.url,
          },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenExpiresAt: expiresAt,
            scope: tokens.scope,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: {
              cloudId,
              workspaceName,
              resourceUrl: confluenceResource?.url,
            },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save Confluence connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Confluence Connected!",
      `Successfully connected ${workspaceName}`,
      "confluence",
    );
  } catch (error) {
    console.error("Confluence callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Confluence Connection Failed",
      "An unexpected error occurred",
      "confluence",
    );
  }
}
