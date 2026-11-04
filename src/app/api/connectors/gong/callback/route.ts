import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/gong/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/gong/callback`;
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
        "Gong Connection Failed",
        error,
        "gong",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Gong Connection Failed",
        "Missing authorization code or state",
        "gong",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Gong Connection Failed",
        "Invalid state parameter",
        "gong",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Gong Connection Failed",
        "Authorization expired. Please try again.",
        "gong",
      );
    }
    const creds = await getConnectorCredentials("gong");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Gong Connection Failed",
        "gong integration is not properly configured",
        "gong",
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
    const tokenUrl = `https://app.gong.io/oauth2/access-token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Gong Connection Failed",
        "Failed to exchange authorization code",
        "gong",
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
        "Gong Connection Failed",
        "Provider did not return an access token",
        "gong",
      );
    }

    const email = null;
    const label = "Gong";

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "gong",
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
      console.error("Failed to save gong connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Gong Connected!",
      `Successfully connected ${label || "Gong"}`,
      "gong",
    );
  } catch (error) {
    console.error("gong callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Gong Connection Failed",
      "An unexpected error occurred",
      "gong",
    );
  }
}
