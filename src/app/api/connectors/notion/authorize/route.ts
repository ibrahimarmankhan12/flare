import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getConnectorCredentials } from "lib/connectors/credentials";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/notion/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/notion/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = await getConnectorCredentials("notion");
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "Notion integration is not configured. Set NOTION_CLIENT_ID/NOTION_CLIENT_SECRET in env or configure OAuth in the admin panel.",
        },
        { status: 500 },
      );
    }

    const redirectUri = getRedirectUri(request);
    const state = Buffer.from(
      JSON.stringify({ userId: session.user.id, timestamp: Date.now() }),
    ).toString("base64");

    const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    // Notion's authorize page supports `owner` to force user vs workspace
    // installation; we want a user-level install for personal AI access.
    authUrl.searchParams.set("owner", "user");

    return NextResponse.json({
      authUrl: authUrl.toString(),
      debug: { redirect_uri: redirectUri },
    });
  } catch (error) {
    console.error("Error initiating Notion OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate Notion authentication" },
      { status: 500 },
    );
  }
}
