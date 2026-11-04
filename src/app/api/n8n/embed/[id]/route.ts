import { createSign, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { getSession } from "auth/server";
import { ensureN8nUser } from "lib/n8n/provision";

export const dynamic = "force-dynamic";

const N8N_EDITOR_URL =
  process.env.N8N_EDITOR_URL ?? "https://n8n.flare-sh.tech";
const PRIVATE_KEY_PATH =
  process.env.N8N_EMBED_PRIVATE_KEY ?? "/opt/n8n-embed/private.pem";
const KID = "flare-embed-1";
const ISSUER = "https://flare-sh.tech";
const AUDIENCE = "n8n-editor";

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function signEmbedToken(sub: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: KID, typ: "JWT" };
  const payload = {
    sub,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
    email,
  };
  const headerB64 = base64Url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64Url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const privateKey = readFileSync(PRIVATE_KEY_PATH, "utf8");
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const n8nUser = await ensureN8nUser(session);
  if (!n8nUser.email) {
    return new Response("n8n account not provisioned", { status: 500 });
  }

  const token = signEmbedToken(n8nUser.email, n8nUser.email);
  const embedUrl = `${N8N_EDITOR_URL}/rest/auth/embed?token=${encodeURIComponent(token)}&redirectTo=${encodeURIComponent(`/workflow/${id}`)}`;
  return Response.redirect(embedUrl, 302);
}