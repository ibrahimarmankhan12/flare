import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/salesforce/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/salesforce/callback`;
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
        "Salesforce Connection Failed",
        error,
        "salesforce",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "Salesforce Connection Failed",
        "Missing authorization code or state",
        "salesforce",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "Salesforce Connection Failed",
        "Invalid state parameter",
        "salesforce",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "Salesforce Connection Failed",
        "Authorization expired. Please try again.",
        "salesforce",
      );
    }
    const creds = await getConnectorCredentials("salesforce");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "Salesforce Connection Failed",
        "salesforce integration is not properly configured",
        "salesforce",
      );
    }
    const redirectUri = getRedirectUri(request);
  const baseUrl = process.env.SALESFORCE_LOGIN_URL?.replace(/\/+$/, "") || "https://login.salesforce.com";


    // Exchange code for token.
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
    };
    const tokenUrl = `${baseUrl}/services/oauth2/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "Salesforce Connection Failed",
        "Failed to exchange authorization code",
        "salesforce",
      );
    }
    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id?: string; instance_url?: string;
    };
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "Salesforce Connection Failed",
        "Provider did not return an access token",
        "salesforce",
      );
    }

    // Identity + instance_url come from the token response.
    const email = null; // Salesforce identity requires /services/oauth2/userinfo — not fetched here.
    const label = tokens.id || "Salesforce";

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "salesforce",
          email: email || null,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: { instance_url: tokens.instance_url },
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
            metadata: { instance_url: tokens.instance_url },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save salesforce connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "Salesforce Connected!",
      `Successfully connected ${label || "Salesforce"}`,
      "salesforce",
    );
  } catch (error) {
    console.error("salesforce callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "Salesforce Connection Failed",
      "An unexpected error occurred",
      "salesforce",
    );
  }
}
