import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getConnectorCredentials } from "lib/connectors/credentials";

const SCOPES = "api refresh_token offline_access id";

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
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const creds = await getConnectorCredentials("salesforce");
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "salesforce integration is not configured. Set SALESFORCE_CLIENT_ID/SALESFORCE_CLIENT_ID_SECRET in env or configure OAuth in the admin panel.",
        },
        { status: 500 },
      );
    }
    const redirectUri = getRedirectUri(request);
    const state = Buffer.from(
      JSON.stringify({ userId: session.user.id, timestamp: Date.now() }),
    ).toString("base64");

    const authUrl = new URL(`${process.env.SALESFORCE_LOGIN_URL?.replace(/\/+$/, "") || "https://login.salesforce.com"}/services/oauth2/authorize`);
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");


    return NextResponse.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error("Error initiating salesforce OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate salesforce authentication" },
      { status: 500 },
    );
  }
}
