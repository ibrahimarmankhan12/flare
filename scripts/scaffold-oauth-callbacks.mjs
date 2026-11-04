#!/usr/bin/env node
/**
 * One-time scaffold script that emits OAuth callback routes for the 22
 * remaining OAuth providers. Run with: `node scripts/scaffold-oauth-callbacks.mjs`
 *
 * Each provider's callback: (1) parses code+state, (2) exchanges code for
 * token at the provider's token URL, (3) fetches identity (email/user) at
 * the provider's identity URL, (4) upserts the user_connector row.
 *
 * The template handles all four steps. Provider-specific differences live
 * in the descriptor.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "src", "app", "api", "connectors");

const PROVIDERS = [
  {
    name: "jira",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    tokenMethod: "json",
    identityUrl: null, // Atlassian uses accessible-resources
    identityMethod: "atlassian-resources",
    emailFrom: null,
    labelFrom: "workspaceName",
    metadataExtra: "jiraCloudId",
    aud: "api.atlassian.com",
  },
  {
    name: "linear",
    tokenUrl: "https://api.linear.app/oauth/token",
    tokenMethod: "json",
    identityUrl: "https://api.linear.app/graphql",
    identityBody: JSON.stringify({
      query: "{ viewer { id name email } }",
    }),
    identityHeaders: { "Content-Type": "application/json" },
    identityMethod: "linear-graphql",
    emailFrom: "data.viewer.email",
    labelFrom: "data.viewer.name",
  },
  {
    name: "asana",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    tokenMethod: "form",
    identityUrl: "https://app.asana.com/api/1.0/users/me",
    identityMethod: "asana",
    emailFrom: "data.email",
    labelFrom: "data.name",
  },
  {
    name: "clickup",
    tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
    tokenMethod: "form",
    identityUrl: "https://api.clickup.com/api/v2/user",
    identityMethod: "clickup",
    emailFrom: "user.email",
    labelFrom: "user.username",
  },
  {
    name: "productboard",
    tokenUrl: "https://api.productboard.com/oauth/token",
    tokenMethod: "json",
    identityUrl: "https://api.productboard.com/users/me",
    identityMethod: "json",
    emailFrom: "data.email",
    labelFrom: "data.name",
  },
  {
    name: "coda",
    tokenUrl: "https://coda.io/apis/v1/oauth/token",
    tokenMethod: "form",
    identityUrl: "https://coda.io/apis/v1/whoami",
    identityMethod: "coda",
    emailFrom: "email",
    labelFrom: "name",
  },
  {
    name: "outline",
    tokenUrl: "<baseUrl>/oauth/token",
    tokenMethod: "form",
    identityUrl: "<baseUrl>/api/auth.info",
    identityMethod: "outline",
    emailFrom: "data.user.email",
    labelFrom: "data.user.name",
    baseUrlExpr:
      'process.env.OUTLINE_BASE_URL?.replace(/\\/+$/, "") || "https://app.getoutline.com"',
  },
  {
    name: "slab",
    tokenUrl: "https://slab.com/oauth/token",
    tokenMethod: "form",
    identityUrl: "https://api.slab.com/v1/users/me",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
  },
  {
    name: "guru",
    tokenUrl: "https://api.getguru.com/oauth/token",
    tokenMethod: "form",
    identityUrl: "https://api.getguru.com/api/v1/users/me",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
  },
  {
    name: "highspot",
    tokenUrl: "https://api.highspot.com/oauth/token",
    tokenMethod: "form",
    identityUrl: "https://api.highspot.com/v1.0/users/me",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
  },
  {
    name: "gitlab",
    tokenUrl: "<baseUrl>/oauth/token",
    tokenMethod: "form",
    identityUrl: "<baseUrl>/api/v4/user",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
    baseUrlExpr:
      'process.env.GITLAB_BASE_URL?.replace(/\\/+$/, "") || "https://gitlab.com"',
  },
  {
    name: "bitbucket",
    tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
    tokenMethod: "form",
    identityUrl: "https://api.bitbucket.org/2.0/user",
    identityMethod: "json",
    emailFrom: "email_address",
    labelFrom: "display_name",
  },
  {
    name: "dropbox",
    tokenUrl: "https://api.dropbox.com/oauth2/token",
    tokenMethod: "form",
    identityUrl: "https://api.dropboxapi.com/2/users/get_current_account",
    identityMethod: "dropbox",
    emailFrom: "email",
    labelFrom: "name.display_name",
  },
  {
    name: "zendesk",
    tokenUrl: "<baseUrl>/oauth/tokens",
    tokenMethod: "form",
    identityUrl: "<baseUrl>/api/v2/users/me.json",
    identityMethod: "zendesk",
    emailFrom: "user.email",
    labelFrom: "user.name",
    baseUrlExpr:
      '(process.env.ZENDESK_SUBDOMAIN ? `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com` : "")',
  },
  {
    name: "freshdesk",
    tokenUrl: "<baseUrl>/oauth/token",
    tokenMethod: "form",
    identityUrl: "<baseUrl>/api/v2/agents/me",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
    baseUrlExpr:
      '(process.env.FRESHDESK_SUBDOMAIN ? `https://${process.env.FRESHDESK_SUBDOMAIN}.freshdesk.com` : "")',
  },
  {
    name: "salesforce",
    tokenUrl: "<baseUrl>/services/oauth2/token",
    tokenMethod: "form",
    identityUrl: null, // identity is in token response
    identityMethod: "salesforce-token-response",
    emailFrom: null,
    labelFrom: null,
    baseUrlExpr:
      'process.env.SALESFORCE_LOGIN_URL?.replace(/\\/+$/, "") || "https://login.salesforce.com"',
  },
  {
    name: "hubspot",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    tokenMethod: "form",
    identityUrl: "https://api.hubapi.com/oauth/v1/access-tokens/<accessToken>",
    identityMethod: "hubspot",
    emailFrom: "user",
    labelFrom: "user",
  },
  {
    name: "airtable",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    tokenMethod: "form",
    identityUrl: "https://airtable.com/oauth2/v1/userinfo",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
  },
  {
    name: "gong",
    tokenUrl: "https://app.gong.io/oauth2/access-token",
    tokenMethod: "form",
    identityUrl: null,
    identityMethod: "gong-no-identity",
    emailFrom: null,
    labelFrom: null,
  },
  {
    name: "egnyte",
    tokenUrl: "<baseUrl>/pub/oauth/token",
    tokenMethod: "form",
    identityUrl: "<baseUrl>/pubapi/v1/userinfo",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "name",
    baseUrlExpr:
      'process.env.EGNYTE_DOMAIN?.replace(/\\/+$/, "") || ""',
  },
  {
    name: "discord",
    tokenUrl: "https://discord.com/api/oauth2/token",
    tokenMethod: "form",
    identityUrl: "https://discord.com/api/users/@me",
    identityMethod: "json",
    emailFrom: "email",
    labelFrom: "username",
  },
  {
    name: "teams",
    tokenUrl: "https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token",
    tokenMethod: "form",
    identityUrl: "https://graph.microsoft.com/v1.0/me",
    identityMethod: "json",
    emailFrom: "mail",
    labelFrom: "displayName",
    baseUrlExpr: '"https://login.microsoftonline.com"',
    isTeams: true,
  },
];

function callbackRoute(p) {
  const usesBaseUrl =
    p.baseUrlExpr !== undefined || p.tokenUrl.includes("<baseUrl>");
  const baseUrlDecl = p.baseUrlExpr
    ? `  const baseUrl = ${p.baseUrlExpr};\n`
    : usesBaseUrl
    ? `  const baseUrl = process.env.BASE_URL || "";\n`
    : "";
  const tokenUrl = p.tokenUrl
    .replace("<baseUrl>", "${baseUrl}")
    .replace("<tenant>", "${tenant}");
  const identityUrl = p.identityUrl
    ? p.identityUrl
        .replace("<baseUrl>", "${baseUrl}")
        .replace("<tenant>", "${tenant}")
        .replace("<accessToken>", "${encodeURIComponent(tokens.access_token)}")
    : null;
  const identityJson = p.identityBody ? JSON.stringify(p.identityBody) : null;
  return `import { getConnectorCredentials } from "lib/connectors/credentials";
import { createConnectorOauthResponsePage } from "lib/connectors/oauth-callback-page";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest } from "next/server";

function getRedirectUri(request: NextRequest): string {
  if (process.env.FLARE_AUTH_URL) {
    const baseUrl = process.env.FLARE_AUTH_URL.replace(/\\/+$/, "");
    return \`\${baseUrl}/api/connectors/${p.name}/callback\`;
  }
  const url = new URL(request.url);
  return \`\${url.protocol}//\${url.host}/api/connectors/${p.name}/callback\`;
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
        "${capitalize(p.name)} Connection Failed",
        error,
        "${p.name}",
      );
    }
    if (!code || !state) {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "Missing authorization code or state",
        "${p.name}",
      );
    }
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "Invalid state parameter",
        "${p.name}",
      );
    }
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "Authorization expired. Please try again.",
        "${p.name}",
      );
    }
    const creds = await getConnectorCredentials("${p.name}");
    if (!creds) {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "${p.name} integration is not properly configured",
        "${p.name}",
      );
    }
    const redirectUri = getRedirectUri(request);
${baseUrlDecl}${p.isTeams ? "  const tenant = process.env.MICROSOFT_TENANT_ID || \"common\";\n" : ""}

    // Exchange code for token.
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
    };
    const tokenUrl = \`${tokenUrl}\`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      ${p.tokenMethod === "form"
        ? `headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),`
        : `headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),`}
    });
    if (!tokenRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "Failed to exchange authorization code",
        "${p.name}",
      );
    }
    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      ${p.identityMethod === "salesforce-token-response" ? "id?: string; instance_url?: string;" : ""}
    };
    if (!tokens.access_token) {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "Provider did not return an access token",
        "${p.name}",
      );
    }

${
  p.identityMethod === "salesforce-token-response"
    ? `    // Identity + instance_url come from the token response.
    const email = null; // Salesforce identity requires /services/oauth2/userinfo — not fetched here.
    const label = tokens.id || "${capitalize(p.name)}";`
    : p.identityMethod === "gong-no-identity"
    ? `    const email = null;
    const label = "Gong";`
    : `    // Fetch identity.
    const identityUrl = \`${identityUrl}\`;
    const identityHeaders: Record<string, string> = { Authorization: \`Bearer \${tokens.access_token}\` };
    ${identityJson ? `identityHeaders["Content-Type"] = "application/json";` : ""}
    ${p.identityMethod === "linear-graphql" ? `identityHeaders["Content-Type"] = "application/json";` : ""}
    const identityRes = await fetch(identityUrl, {
      method: ${p.identityMethod === "linear-graphql" ? '"POST"' : '"GET"'},
      headers: identityHeaders,
      ${identityJson ? `body: ${identityJson},` : ""}
    });
    if (!identityRes.ok) {
      return createConnectorOauthResponsePage(
        "error",
        "${capitalize(p.name)} Connection Failed",
        "Failed to fetch user identity",
        "${p.name}",
      );
    }
    const identity = await identityRes.json();
    const email = ${p.emailFrom ? `getPath(identity, "${p.emailFrom}")` : "null"};
    const label = ${p.labelFrom ? `getPath(identity, "${p.labelFrom}")` : `"${capitalize(p.name)}"`};
    function getPath(obj: any, path: string): string | null {
      return path.split(".").reduce((o, k) => (o == null ? null : o[k]), obj) ?? null;
    }`
}

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    try {
      await db
        .insert(UserConnectorTable)
        .values({
          userId: stateData.userId,
          provider: "${p.name}",
          email: email || null,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          isConnected: true,
          lastSyncAt: new Date(),
          metadata: ${
            p.identityMethod === "salesforce-token-response"
              ? `{ instance_url: tokens.instance_url }`
              : `{ name: label }`
          },
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
            metadata: ${
              p.identityMethod === "salesforce-token-response"
                ? `{ instance_url: tokens.instance_url }`
                : `{ name: label }`
            },
            updatedAt: new Date(),
          },
        });
    } catch (dbError) {
      console.error("Failed to save ${p.name} connection:", dbError);
    }

    return createConnectorOauthResponsePage(
      "success",
      "${capitalize(p.name)} Connected!",
      \`Successfully connected \${label || "${capitalize(p.name)}"}\`,
      "${p.name}",
    );
  } catch (error) {
    console.error("${p.name} callback error:", error);
    return createConnectorOauthResponsePage(
      "error",
      "${capitalize(p.name)} Connection Failed",
      "An unexpected error occurred",
      "${p.name}",
    );
  }
}
`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function main() {
  for (const p of PROVIDERS) {
    const dir = join(ROOT, p.name, "callback");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "route.ts"), callbackRoute(p));
    console.log(`Wrote ${p.name}/callback/route.ts`);
  }
  console.log("Done.");
}

await main();
