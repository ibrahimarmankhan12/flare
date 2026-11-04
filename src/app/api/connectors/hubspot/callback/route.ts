import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/hubspot/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/hubspot/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        error,
        "hubspot",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "Missing authorization code or state",
        "hubspot",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "Invalid state parameter",
        "hubspot",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "Authorization expired. Please try again.",
        "hubspot",
      );
    }
    const creds = await getConnectorCredentials("hubspot");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "hubspot integration is not properly configured",
        "hubspot",
      );
    }
    const redirectUri = getRedirectUri(request);


    // Exchange code for token.
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
    };
    const tokenUrl = `https://api.hubapi.com/oauth/v1/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "Failed to exchange authorization code",
        "hubspot",
      );
    }
    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      
    };
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "Provider did not return an access token",
        "hubspot",
      );
    }

    // Fetch identity.
    const identityUrl = `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(tokens.access_token)}`;
    const identityHeaders: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}` };
    
    
    const identityRes = await fetch(identityUrl, {
      method: "GET",
      headers: identityHeaders,
      
    });
    if (!identityRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Hubspot Connection Failed",
        "Failed to fetch user identity",
        "hubspot",
      );
    }
    const identity = await identityRes.json();
    const email = getPath(identity, "user");
    const label = getPath(identity, "user");
    function getPath(obj: any, path: string): string | null {
      return path.split(".").reduce((o, k) => (o == null ? null : o[k]), obj) ?? null;
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "hubspot",
          email: email || null,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: { name: label },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            email: email || null,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenExpiresAt: expiresAt,
            scope: tokens.scope,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: { name: label },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save hubspot connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Hubspot Connected!",
      `Successfully connected ${label || "Hubspot"}`,
      "hubspot",
    );
  } catch (error) {
    console.error("hubspot callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Hubspot Connection Failed",
      "An unexpected error occurred",
      "hubspot",
    );
  }
}
