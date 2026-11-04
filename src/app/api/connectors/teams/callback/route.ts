import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/teams/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/teams/callback`;
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
        "Teams Connection Failed",
        error,
        "teams",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Teams Connection Failed",
        "Missing authorization code or state",
        "teams",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Teams Connection Failed",
        "Invalid state parameter",
        "teams",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Teams Connection Failed",
        "Authorization expired. Please try again.",
        "teams",
      );
    }
    const creds = await getConnectorCredentials("teams");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Teams Connection Failed",
        "teams integration is not properly configured",
        "teams",
      );
    }
    const redirectUri = getRedirectUri(request);
    const tenant = process.env.MICROSOFT_TENANT_ID || "common";


    // Exchange code for token.
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
    };
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Teams Connection Failed",
        "Failed to exchange authorization code",
        "teams",
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
        "Teams Connection Failed",
        "Provider did not return an access token",
        "teams",
      );
    }

    // Fetch identity.
    const identityUrl = `https://graph.microsoft.com/v1.0/me`;
    const identityHeaders: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}` };
    
    
    const identityRes = await fetch(identityUrl, {
      method: "GET",
      headers: identityHeaders,
      
    });
    if (!identityRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Teams Connection Failed",
        "Failed to fetch user identity",
        "teams",
      );
    }
    const identity = await identityRes.json();
    const email = getPath(identity, "mail");
    const label = getPath(identity, "displayName");
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
          provider: "teams",
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
      console.error("Failed to save teams connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Teams Connected!",
      `Successfully connected ${label || "Teams"}`,
      "teams",
    );
  } catch (error) {
    console.error("teams callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Teams Connection Failed",
      "An unexpected error occurred",
      "teams",
    );
  }
}
