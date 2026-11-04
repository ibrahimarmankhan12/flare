import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getConnectorCredentials } from "lib/connectors/credentials";

const GITHUB_SCOPES = ["repo", "read:user", "user:email"].join(" ");

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/github/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/github/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = await getConnectorCredentials("github");
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "GitHub integration is not configured. Set GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET in env or configure OAuth in the admin panel.",
        },
        { status: 500 },
      );
    }

    const redirectUri = getRedirectUri(request);
    const state = Buffer.from(
      JSON.stringify({ userId: session.user.id, timestamp: Date.now() }),
    ).toString("base64");

    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", GITHUB_SCOPES);
    authUrl.searchParams.set("state", state);
    // Allow re-prompting to re-grant scopes if the user has already authorized
    // the app for a subset of the requested scopes.
    authUrl.searchParams.set("allow_signup", "true");

    return NextResponse.json({
      authUrl: authUrl.toString(),
      debug: { redirect_uri: redirectUri },
    });
  } catch (error) {
    console.error("Error initiating GitHub OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate GitHub authentication" },
      { status: 500 },
    );
  }
}
