import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/slack/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/slack/callback`;
}

interface SlackV2TokenResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  team?: { id: string; name: string };
  authed_user?: {
    id: string;
    scope: string;
    access_token?: string;
    token_type?: string;
  };
}

interface SlackIdentityResponse {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
  team?: { id: string; name: string };
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
        "Slack Connection Failed",
        error,
        "slack",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        "Missing authorization code or state",
        "slack",
      );
    }

    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        "Invalid state parameter",
        "slack",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        "Authorization expired. Please try again.",
        "slack",
      );
    }
    const creds = await getConnectorCredentials("slack");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        "Slack integration is not properly configured",
        "slack",
      );
    }

    const redirectUri = getRedirectUri(request);

    // Slack v2 OAuth token exchange.
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        "Failed to exchange authorization code",
        "slack",
      );
    }
    const tokens: SlackV2TokenResponse = await tokenRes.json();
    if (!tokens.ok || !tokens.authed_user?.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        tokens.error || "Slack did not return a user access token",
        "slack",
      );
    }

    const userToken = tokens.authed_user.access_token;

    // Identify the user.
    const identityRes = await fetch("https://slack.com/api/users.identity", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (!identityRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        "Failed to identify the Slack user",
        "slack",
      );
    }
    const identity: SlackIdentityResponse = await identityRes.json();
    if (!identity.ok || !identity.user) {
      return createConnectorOauthResponsePage(
        "error",
        "Slack Connection Failed",
        identity.error || "Could not identify the Slack user",
        "slack",
      );
    }

    const displayLabel =
      identity.user.email ||
      `${identity.user.name} (${tokens.team?.name ?? "Slack"})`;

    // Slack's signing secret comes from env (no public endpoint exposes it
    // for a user-token app), so pull it from env at connect time and persist
    // it on the connector metadata. Inbound webhook verification reads it
    // back via `extractSlackSigningSecret`. Storing it locally is the only
    // way the inbound route can verify event signatures without another
    // round-trip to Slack.
    const envSigningSecret = process.env.SLACK_SIGNING_SECRET?.trim() || null;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "slack",
          email: identity.user.email || null,
          accessToken: userToken,
          // Slack user tokens don't expire and don't have refresh tokens.
          refreshToken: userToken,
          scope: tokens.authed_user.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: {
            name: identity.user.name,
            slackUserId: identity.user.id,
            teamId: tokens.team?.id,
            teamName: tokens.team?.name,
            signingSecret: envSigningSecret,
          },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            email: identity.user.email || null,
            accessToken: userToken,
            refreshToken: userToken,
            scope: tokens.authed_user.scope,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: {
              name: identity.user.name,
              slackUserId: identity.user.id,
              teamId: tokens.team?.id,
              teamName: tokens.team?.name,
              signingSecret: envSigningSecret,
            },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save Slack connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Slack Connected!",
      `Successfully connected ${displayLabel}`,
      "slack",
    );
  } catch (error) {
    console.error("Slack callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Slack Connection Failed",
      "An unexpected error occurred",
      "slack",
    );
  }
}
