#!/usr/bin/env node
/**
 * One-time scaffold script that emits OAuth authorize + callback routes
 * for the 28 remaining OAuth providers. Run with: `node scripts/scaffold-oauth-routes.mjs`
 *
 * Each provider has a small descriptor: name, authorize URL, token URL,
 * scope list, identity endpoint, and a couple of provider-specific fields.
 * The output is a set of `src/app/api/connectors/<provider>/{authorize,callback}/route.ts`
 * files. The handler bodies are uniform and follow the slack/confluence
 * template — the per-provider variation lives in the descriptor.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "src", "app", "api", "connectors");

const PROVIDERS = [
  {
    name: "jira",
    authorizeUrl: "https://auth.atlassian.com/authorize",
    audience: "api.atlassian.com",
    scopes: [
      "read:jira-work",
      "read:jira-user",
      "write:comment:jira",
      "offline_access",
    ],
    env: "JIRA_CLIENT_ID",
    resourceMatcher: "jira",
    cloudIdMetaKey: "jiraCloudId",
  },
  {
    name: "linear",
    authorizeUrl: "https://linear.app/oauth/authorize",
    scopes: ["read", "write", "issues:create"],
    env: "LINEAR_CLIENT_ID",
  },
  {
    name: "asana",
    authorizeUrl: "https://app.asana.com/-/oauth_authorize",
    scopes: ["default"],
    env: "ASANA_CLIENT_ID",
  },
  {
    name: "clickup",
    authorizeUrl: "https://app.clickup.com/api",
    scopes: ["user:read", "task:read", "task:write", "list:read", "space:read"],
    env: "CLICKUP_CLIENT_ID",
  },
  {
    name: "productboard",
    authorizeUrl: "https://app.productboard.com/oauth2/authorize",
    scopes: ["read", "write"],
    env: "PRODUCTBOARD_CLIENT_ID",
  },
  {
    name: "coda",
    authorizeUrl: "https://coda.io/oauth/authorize",
    scopes: ["docs.read", "docs.write"],
    env: "CODA_CLIENT_ID",
  },
  {
    name: "outline",
    authorizeUrl: "<base>/oauth/authorize",
    scopes: ["read"],
    env: "OUTLINE_CLIENT_ID",
    isTemplate: true,
    baseEnv: "OUTLINE_BASE_URL",
    defaultBase: "https://app.getoutline.com",
  },
  {
    name: "slab",
    authorizeUrl: "https://slab.com/oauth/authorize",
    scopes: ["read"],
    env: "SLAB_CLIENT_ID",
  },
  {
    name: "guru",
    authorizeUrl: "https://app.getguru.com/oauth/authorize",
    scopes: ["read", "write"],
    env: "GURU_CLIENT_ID",
  },
  {
    name: "highspot",
    authorizeUrl: "https://api.highspot.com/oauth/authorize",
    scopes: ["read"],
    env: "HIGHSPOT_CLIENT_ID",
  },
  {
    name: "gitlab",
    authorizeUrl: "<base>/oauth/authorize",
    scopes: ["read_api", "read_user", "api"],
    env: "GITLAB_CLIENT_ID",
    isTemplate: true,
    baseEnv: "GITLAB_BASE_URL",
    defaultBase: "https://gitlab.com",
  },
  {
    name: "bitbucket",
    authorizeUrl: "https://bitbucket.org/site/oauth2/authorize",
    scopes: ["account", "repository", "issue", "pullrequest"],
    env: "BITBUCKET_CLIENT_ID",
  },
  {
    name: "dropbox",
    authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
    scopes: ["files.metadata.read", "files.content.read"],
    env: "DROPBOX_CLIENT_ID",
    tokenAccessType: "offline",
  },
  {
    name: "zendesk",
    authorizeUrl: "<base>/oauth/authorizations/new",
    scopes: ["read", "write"],
    env: "ZENDESK_CLIENT_ID",
    isTemplate: true,
    baseEnv: "ZENDESK_SUBDOMAIN",
    defaultBase: "https://SUBDOMAIN.zendesk.com",
  },
  {
    name: "freshdesk",
    authorizeUrl: "<base>/oauth/authorize",
    scopes: ["read", "write"],
    env: "FRESHDESK_CLIENT_ID",
    isTemplate: true,
    baseEnv: "FRESHDESK_SUBDOMAIN",
    defaultBase: "https://SUBDOMAIN.freshdesk.com",
  },
  {
    name: "salesforce",
    authorizeUrl: "<login>/services/oauth2/authorize",
    scopes: ["api", "refresh_token", "offline_access", "id"],
    env: "SALESFORCE_CLIENT_ID",
    isTemplate: true,
    baseEnv: "SALESFORCE_LOGIN_URL",
    defaultBase: "https://login.salesforce.com",
  },
  {
    name: "hubspot",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.deals.read",
      "crm.objects.accounts.read",
    ],
    env: "HUBSPOT_CLIENT_ID",
  },
  {
    name: "airtable",
    authorizeUrl: "https://airtable.com/oauth2/v1/authorize",
    scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    env: "AIRTABLE_CLIENT_ID",
  },
  {
    name: "gong",
    authorizeUrl: "https://app.gong.io/oauth2/authorize",
    scopes: ["api:read"],
    env: "GONG_CLIENT_ID",
  },
  {
    name: "egnyte",
    authorizeUrl: "<base>/pub/oauth/authorize",
    scopes: ["read", "write"],
    env: "EGNYTE_CLIENT_ID",
    isTemplate: true,
    baseEnv: "EGNYTE_DOMAIN",
    defaultBase: "https://EGNYTE.egnyte.com",
  },
  {
    name: "discord",
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    scopes: ["identify", "guilds", "bot", "messages.read", "messages.write"],
    env: "DISCORD_CLIENT_ID",
  },
  {
    name: "teams",
    authorizeUrl: "<tenant>/oauth2/v2.0/authorize",
    scopes: ["offline_access", "Chat.Read", "Chat.ReadWrite", "User.Read"],
    env: "MICROSOFT_CLIENT_ID",
    isTemplate: true,
    baseEnv: "MICROSOFT_TENANT_ID",
    defaultBase: "https://login.microsoftonline.com/common",
  },
];

function authorizeRoute(p) {
  const scopeStr = p.scopes.join(" ");
  const baseUrlExpr = p.isTemplate
    ? `process.env.${p.baseEnv}?.replace(/\\/+$/, "") || "${p.defaultBase}"`
    : null;
  let authUrlExpr;
  if (p.isTemplate) {
    if (p.name === "teams") {
      authUrlExpr = `\`\${process.env.MICROSOFT_TENANT_ID || "common"}/oauth2/v2.0/authorize\``;
    } else if (p.name === "salesforce") {
      authUrlExpr = `\`\${${baseUrlExpr}}/services/oauth2/authorize\``;
    } else {
      authUrlExpr = `\`\${${baseUrlExpr}}${p.authorizeUrl.replace("<base>", "").replace("<login>", "")}\``;
    }
  } else {
    authUrlExpr = `"${p.authorizeUrl}"`;
  }
  const baseSetup = p.isTemplate
    ? (p.name === "teams" ? "" : `  const baseUrl = ${baseUrlExpr};\n`)
    : "";
  const tenantSetup = p.name === "teams"
    ? `  const tenant = process.env.MICROSOFT_TENANT_ID || "common";\n`
    : "";
  return `import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getConnectorCredentials } from "lib/connectors/credentials";

const SCOPES = ${JSON.stringify(scopeStr)};

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
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const creds = await getConnectorCredentials("${p.name}");
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "${p.name} integration is not configured. Set ${p.env}/${p.env}_SECRET in env or configure OAuth in the admin panel.",
        },
        { status: 500 },
      );
    }
${baseSetup}
${tenantSetup}
    const redirectUri = getRedirectUri(request);
    const state = Buffer.from(
      JSON.stringify({ userId: session.user.id, timestamp: Date.now() }),
    ).toString("base64");

    const authUrl = new URL(${authUrlExpr});
    authUrl.searchParams.set("client_id", creds.clientId);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");
${p.tokenAccessType ? `    authUrl.searchParams.set("${p.tokenAccessType === "offline" ? "token_access_type" : "prompt"}", "offline");` : ""}

    return NextResponse.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error("Error initiating ${p.name} OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate ${p.name} authentication" },
      { status: 500 },
    );
  }
}
`;
}

async function main() {
  for (const p of PROVIDERS) {
    const authDir = join(ROOT, p.name, "authorize");
    await mkdir(authDir, { recursive: true });
    await writeFile(join(authDir, "route.ts"), authorizeRoute(p));
    console.log(`Wrote ${p.name}/authorize/route.ts`);
  }
  console.log("Done. Note: callback routes for these providers must be hand-written — they vary in identity-fetch logic.");
}

await main();
