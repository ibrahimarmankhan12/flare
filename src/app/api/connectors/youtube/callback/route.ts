import { NextRequest } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { getConnectorCredentials } from "lib/connectors/credentials";

// Get the correct redirect URI at request time
function getRedirectUri(request: NextRequest): string {
  // First priority: explicit FLARE_AUTH_URL from env
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/youtube/callback`;
  }

  // Second priority: derive from request URL
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return `${baseUrl}/api/connectors/youtube/callback`;
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
      return createResponsePage("error", "YouTube Connection Failed", error);
    }

    if (!code || !state) {
      return createResponsePage(
        "error",
        "YouTube Connection Failed",
        "Missing authorization code or state",
      );
    }

    // Decode and verify state
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createResponsePage(
        "error",
        "YouTube Connection Failed",
        "Invalid state parameter",
      );
    }

    // Check if state is not too old (15 minutes)
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createResponsePage(
        "error",
        "YouTube Connection Failed",
        "Authorization expired. Please try again.",
      );
    }

    const creds = await getConnectorCredentials("youtube");
    if (!creds) {
      return createResponsePage(
        "error",
        "YouTube Connection Failed",
        "YouTube integration is not properly configured",
      );
    }

    const redirectUri = getRedirectUri(request);

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return createResponsePage(
        "error",
        "YouTube Connection Failed",
        "Failed to exchange authorization code",
      );
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Get user info from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      return createResponsePage(
        "error",
        "YouTube Connection Failed",
        "Failed to get user information",
      );
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();

    // Save or update connector in database
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "youtube",
          email: userInfo.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: {
            name: userInfo.name,
            picture: userInfo.picture,
          },
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
            metadata: {
              name: userInfo.name,
              picture: userInfo.picture,
            },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save YouTube connection to database:", dbError);
      // Continue anyway - the OAuth succeeded
    }

    return createResponsePage(
      "success",
      "YouTube Connected!",
      `Successfully connected ${userInfo.email}`,
    );
  } catch (error) {
    console.error("YouTube callback error:", error);
    return createResponsePage(
      "error",
      "YouTube Connection Failed",
      "An unexpected error occurred",
    );
  }
}

function createResponsePage(
  type: "success" | "error",
  title: string,
  message: string,
) {
  return createConnectorOauthResponsePage(type, title, message, "youtube");
}
