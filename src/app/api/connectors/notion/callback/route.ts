import { NextRequest } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { getConnectorCredentials } from "lib/connectors/credentials";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/notion/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/notion/callback`;
}

interface NotionTokenResponse {
  access_token?: string;
  bot_id?: string;
  workspace_id?: string;
  workspace_name?: string | null;
  workspace_icon?: string | null;
  owner?:
    | { type: "user"; user: { id: string; name?: string; avatar_url?: string } }
    | { type: "workspace" };
  error?: string;
  message?: string;
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
        "Notion Connection Failed",
        error,
        "notion",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Notion Connection Failed",
        "Missing authorization code or state",
        "notion",
      );
    }

    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Notion Connection Failed",
        "Invalid state parameter",
        "notion",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Notion Connection Failed",
        "Authorization expired. Please try again.",
        "notion",
      );
    }
    const creds = await getConnectorCredentials("notion");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Notion Connection Failed",
        "Notion integration is not properly configured",
        "notion",
      );
    }

    const redirectUri = getRedirectUri(request);
    const basic = Buffer.from(
      `${creds.clientId}:${creds.clientSecret}`,
    ).toString("base64");

    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes
        .json()
        .catch(() => ({ error: "unknown", message: "Token exchange failed" }));
      console.error("Notion token exchange failed:", errorBody);
      return createConnectorOauthResponsePage(
        "error",
        "Notion Connection Failed",
        errorBody.message || errorBody.error || "Failed to exchange code",
        "notion",
      );
    }

    const tokens: NotionTokenResponse = await tokenRes.json();
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "Notion Connection Failed",
        tokens.message || "Notion did not return an access token",
        "notion",
      );
    }

    // Notion has no "current user" endpoint, so we synthesize a label from
    // the workspace name and (if available) the owner user object.
    const workspaceLabel =
      tokens.workspace_name || `Notion workspace ${tokens.workspace_id ?? ""}`;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "notion",
          // No user-level email; use the workspace as the identifier for display.
          email: workspaceLabel,
          accessToken: tokens.access_token,
          // Notion tokens don't expire and aren't refreshed via OAuth.
          refreshToken: tokens.access_token,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: {
            botId: tokens.bot_id,
            workspaceId: tokens.workspace_id,
            workspaceName: tokens.workspace_name,
            workspaceIcon: tokens.workspace_icon,
            owner: tokens.owner,
          },
        })
        .onConflictDoUpdate({
          target: [UserConnectorTable.userId, UserConnectorTable.provider],
          set: {
            email: workspaceLabel,
            accessToken: tokens.access_token,
            refreshToken: tokens.access_token,
            isConnected: true,
            lastSyncAt: new Date(),
            metadata: {
              botId: tokens.bot_id,
              workspaceId: tokens.workspace_id,
              workspaceName: tokens.workspace_name,
              workspaceIcon: tokens.workspace_icon,
              owner: tokens.owner,
            },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save Notion connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Notion Connected!",
      `Successfully connected ${workspaceLabel}`,
      "notion",
    );
  } catch (error) {
    console.error("Notion callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Notion Connection Failed",
      "An unexpected error occurred",
      "notion",
    );
  }
}
