import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getConnectorCredentials } from "lib/connectors/credentials";

const SLACK_USER_SCOPES = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:history",
  "mpim:read",
  "mpim:history",
  "chat:write",
  "users:read",
].join(",");

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/slack/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/slack/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = await getConnectorCredentials("slack");
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "Slack integration is not configured. Set SLACK_CLIENT_ID/SLACK_CLIENT_SECRET in env or configure OAuth in the admin panel.",
        },
        { status: 500 },
      );
    }

    const redirectUri = getRedirectUri(request);
    const state = Buffer.from(
      JSON.stringify({ userId: session.user.id, timestamp: Date.now() }),
    ).toString("base64");

    const authUrl = new URL("https://slack.com/oauth/authorize");
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("scope", SLACK_USER_SCOPES);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    // user_scope is required for user-token OAuth flow on modern Slack apps.
    authUrl.searchParams.set("user_scope", SLACK_USER_SCOPES);

    return NextResponse.json({
      authUrl: authUrl.toString(),
      debug: { redirect_uri: redirectUri },
    });
  } catch (error) {
    console.error("Error initiating Slack OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate Slack authentication" },
      { status: 500 },
    );
  }
}
