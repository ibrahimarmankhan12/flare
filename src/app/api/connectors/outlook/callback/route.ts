import { NextRequest } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { getConnectorCredentials } from "lib/connectors/credentials";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/outlook/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/outlook/callback`;
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface MicrosoftUserInfo {
  userPrincipalName?: string;
  mail?: string;
  displayName?: string;
  id?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        errorDescription || error,
        "outlook",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Missing authorization code or state",
        "outlook",
      );
    }

    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Invalid state parameter",
        "outlook",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Authorization expired. Please try again.",
        "outlook",
      );
    }
    const creds = await getConnectorCredentials("outlook");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Outlook integration is not properly configured",
        "outlook",
      );
    }

    const redirectUri = getRedirectUri(request);

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${creds.tenantId || "common"}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          scope: "offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read",
        }),
      },
    );
    if (!tokenResponse.ok) {
      console.error(
        "Outlook token exchange failed:",
        await tokenResponse.text(),
      );
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Failed to exchange authorization code",
        "outlook",
      );
    }
    const tokens: MicrosoftTokenResponse = await tokenResponse.json();
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Microsoft did not return an access token",
        "outlook",
      );
    }

    const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoResponse.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Failed to get user information",
        "outlook",
      );
    }
    const userInfo: MicrosoftUserInfo = await userInfoResponse.json();
    const primaryEmail = userInfo.mail || userInfo.userPrincipalName;
    if (!primaryEmail) {
      return createConnectorOauthResponsePage(
        "error",
        "Outlook Connection Failed",
        "Could not determine a primary Outlook email",
        "outlook",
      );
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "outlook",
          email: primaryEmail,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: { name: userInfo.displayName },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            email: primaryEmail,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || undefined,
            tokenExpiresAt: expiresAt,
            scope: tokens.scope,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: { name: userInfo.displayName },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save Outlook connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Outlook Connected!",
      `Successfully connected ${primaryEmail}`,
      "outlook",
    );
  } catch (error) {
    console.error("Outlook callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Outlook Connection Failed",
      "An unexpected error occurred",
      "outlook",
    );
  }
}
