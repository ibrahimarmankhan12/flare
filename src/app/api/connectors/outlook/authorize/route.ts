import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getConnectorCredentials } from "lib/connectors/credentials";

const OUTLOOK_SCOPES = [
  "offline_access",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "User.Read",
].join(" ");

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\/+$/, "");
    return `${baseUrl}/api/connectors/outlook/callback`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/connectors/outlook/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const creds = await getConnectorCredentials("outlook");
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "Outlook integration is not configured. Set MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET in env or configure OAuth in the admin panel.",
        },
        { status: 500 },
      );
    }

    const redirectUri = getRedirectUri(request);
    const state = Buffer.from(
      JSON.stringify({ userId: session.user.id, timestamp: Date.now() }),
    ).toString("base64");
    const tenant = creds.tenantId || "common";

    const authUrl = new URL(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    );
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("scope", OUTLOOK_SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");

    return NextResponse.json({
      authUrl: authUrl.toString(),
      debug: { redirect_uri: redirectUri, tenant },
    });
  } catch (error) {
    console.error("Error initiating Outlook OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate Outlook authentication" },
      { status: 500 },
    );
  }
}
