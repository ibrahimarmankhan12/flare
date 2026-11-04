import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/jira/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/jira/callback`;
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
        "Jira Connection Failed",
        error,
        "jira",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Jira Connection Failed",
        "Missing authorization code or state",
        "jira",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Jira Connection Failed",
        "Invalid state parameter",
        "jira",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Jira Connection Failed",
        "Authorization expired. Please try again.",
        "jira",
      );
    }
    const creds = await getConnectorCredentials("jira");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Jira Connection Failed",
        "jira integration is not properly configured",
        "jira",
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
    const tokenUrl = `https://auth.atlassian.com/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Jira Connection Failed",
        "Failed to exchange authorization code",
        "jira",
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
        "Jira Connection Failed",
        "Provider did not return an access token",
        "jira",
      );
    }

    // Fetch identity.
    const identityUrl = `null`;
    const identityHeaders: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}` };
    
    
    const identityRes = await fetch(identityUrl, {
      method: "GET",
      headers: identityHeaders,
      
    });
    if (!identityRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Jira Connection Failed",
        "Failed to fetch user identity",
        "jira",
      );
    }
    const identity = await identityRes.json();
    const email = null;
    const label = getPath(identity, "workspaceName");
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
          provider: "jira",
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
      console.error("Failed to save jira connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Jira Connected!",
      `Successfully connected ${label || "Jira"}`,
      "jira",
    );
  } catch (error) {
    console.error("jira callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Jira Connection Failed",
      "An unexpected error occurred",
      "jira",
    );
  }
}
