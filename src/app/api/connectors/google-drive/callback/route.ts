import { NextRequest } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { getConnectorCredentials } from "lib/connectors/credentials";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/google-drive/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/google-drive/callback`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
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
        "Drive Connection Failed",
        error,
        "google-drive",
      );
    }

    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Drive Connection Failed",
        "Missing authorization code or state",
        "google-drive",
      );
    }

    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Drive Connection Failed",
        "Invalid state parameter",
        "google-drive",
      );
    }

    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Drive Connection Failed",
        "Authorization expired. Please try again.",
        "google-drive",
      );
    }

    const creds = await getConnectorCredentials("google-drive");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Drive Connection Failed",
        "Google Drive integration is not properly configured",
        "google-drive",
      );
    }

    const redirectUri = getRedirectUri(request);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Drive token exchange failed:", await tokenResponse.text());
      return createConnectorOauthResponsePage(
        "error",
        "Drive Connection Failed",
        "Failed to exchange authorization code",
        "google-drive",
      );
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );

    if (!userInfoResponse.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Drive Connection Failed",
        "Failed to get user information",
        "google-drive",
      );
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "google-drive",
          email: userInfo.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: { name: userInfo.name, picture: userInfo.picture },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            email: userInfo.email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || undefined,
            tokenExpiresAt: expiresAt,
            scope: tokens.scope,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: { name: userInfo.name, picture: userInfo.picture },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save Drive connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Drive Connected!",
      `Successfully connected ${userInfo.email}`,
      "google-drive",
    );
  } catch (error) {
    console.error("Drive callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Drive Connection Failed",
      "An unexpected error occurred",
      "google-drive",
    );
  }
}
