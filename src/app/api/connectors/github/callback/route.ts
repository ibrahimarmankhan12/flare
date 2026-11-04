import { NextRequest } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { getConnectorCredentials } from "lib/connectors/credentials";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/github/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/github/callback`;
}

interface GitHubTokenResponse {
  access_token: string;
  scope: string;
  token_type: string;
}

interface GitHubUserInfo {
  id: number;
  login: string;
  name?: string;
  email?: string | null;
  avatar_url?: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
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
        "GitHub Connection Failed",
        error,
        "github",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "Missing authorization code or state",
        "github",
      );
    }

    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "Invalid state parameter",
        "github",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "Authorization expired. Please try again.",
        "github",
      );
    }
    const creds = await getConnectorCredentials("github");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "GitHub integration is not properly configured",
        "github",
      );
    }

    const redirectUri = getRedirectUri(request);

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );
    if (!tokenResponse.ok) {
      console.error(
        "GitHub token exchange failed:",
        await tokenResponse.text(),
      );
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "Failed to exchange authorization code",
        "github",
      );
    }
    const tokens: GitHubTokenResponse = await tokenResponse.json();
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "GitHub did not return an access token",
        "github",
      );
    }

    // GitHub user info.
    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "flare-connector",
      },
    });
    if (!userInfoResponse.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "Failed to get user information",
        "github",
      );
    }
    const userInfo: GitHubUserInfo = await userInfoResponse.json();

    // The /user endpoint only returns a public email; if `email` is null,
    // fetch the primary from /user/emails.
    let primaryEmail = userInfo.email || null;
    if (!primaryEmail) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "flare-connector",
        },
      });
      if (emailsRes.ok) {
        const emails: GitHubEmail[] = await emailsRes.json();
        const primary = emails.find((e) => e.primary && e.verified);
        primaryEmail = primary?.email || emails[0]?.email || null;
      }
    }

    if (!primaryEmail) {
      return createConnectorOauthResponsePage(
        "error",
        "GitHub Connection Failed",
        "Could not determine a primary GitHub email. Please set a public email on your GitHub profile.",
        "github",
      );
    }

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "github",
          email: primaryEmail,
          accessToken: tokens.access_token,
          // GitHub OAuth access tokens are long-lived; we still store the
          // token in refreshToken for compatibility with the schema, but
          // it is the same value as accessToken. The connector's refresh
          // helper returns the existing accessToken as-is for GitHub.
          refreshToken: tokens.access_token,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: { login: userInfo.login, name: userInfo.name },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            email: primaryEmail,
            accessToken: tokens.access_token,
            refreshToken: tokens.access_token,
            scope: tokens.scope,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: { login: userInfo.login, name: userInfo.name },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save GitHub connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "GitHub Connected!",
      `Successfully connected ${userInfo.login}`,
      "github",
    );
  } catch (error) {
    console.error("GitHub callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "GitHub Connection Failed",
      "An unexpected error occurred",
      "github",
    );
  }
}
