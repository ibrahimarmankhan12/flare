import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/linear/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/linear/callback`;
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
        "Linear Connection Failed",
        error,
        "linear",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Linear Connection Failed",
        "Missing authorization code or state",
        "linear",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Linear Connection Failed",
        "Invalid state parameter",
        "linear",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Linear Connection Failed",
        "Authorization expired. Please try again.",
        "linear",
      );
    }
    const creds = await getConnectorCredentials("linear");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Linear Connection Failed",
        "linear integration is not properly configured",
        "linear",
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
    const tokenUrl = `https://api.linear.app/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Linear Connection Failed",
        "Failed to exchange authorization code",
        "linear",
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
        "Linear Connection Failed",
        "Provider did not return an access token",
        "linear",
      );
    }

    // Fetch identity.
    const identityUrl = `https://api.linear.app/graphql`;
    const identityHeaders: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}` };
    identityHeaders["Content-Type"] = "application/json";
    identityHeaders["Content-Type"] = "application/json";
    const identityRes = await fetch(identityUrl, {
      method: "POST",
      headers: identityHeaders,
      body: "{\"query\":\"{ viewer { id name email } }\"}",
    });
    if (!identityRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Linear Connection Failed",
        "Failed to fetch user identity",
        "linear",
      );
    }
    const identity = await identityRes.json();
    const email = getPath(identity, "data.viewer.email");
    const label = getPath(identity, "data.viewer.name");
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
          provider: "linear",
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
      console.error("Failed to save linear connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Linear Connected!",
      `Successfully connected ${label || "Linear"}`,
      "linear",
    );
  } catch (error) {
    console.error("linear callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Linear Connection Failed",
      "An unexpected error occurred",
      "linear",
    );
  }
}
