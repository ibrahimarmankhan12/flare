import { randomBytes } from "crypto";
import { pgN8nUserRepository } from "lib/db/pg/repositories/n8n-user-repository.pg";
import { getSession } from "auth/server";
import { createAdminClient } from "lib/n8n/client";

const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "http://127.0.0.1:5678";

function randomPassword(): string {
  return `Flare!${randomBytes(12).toString("base64url")}`;
}

async function acceptInvite(token: string, password: string) {
  const res = await fetch(`${N8N_BASE_URL}/rest/invitations/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      firstName: "Flare",
      lastName: "User",
      password,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to accept invite: ${res.status}`);
  }
}

export async function ensureN8nUser(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session?.user?.id) {
    throw new Error("No session");
  }
  const existing = await pgN8nUserRepository.findByUserId(session.user.id);
  if (existing) {
    return existing;
  }

  const email = session.user.email ?? `${session.user.id}@flare.local`;
  const adminClient = createAdminClient();

  const created = await adminClient.createUser(email);
  const inviteUrl = created.user?.inviteAcceptUrl;
  if (!inviteUrl) {
    throw new Error("No invite URL returned");
  }
  const token = new URL(inviteUrl).searchParams.get("token");
  if (!token) {
    throw new Error("No invite token in URL");
  }

  const password = randomPassword();
  await acceptInvite(token, password);

  const saved = await pgN8nUserRepository.save({
    userId: session.user.id,
    n8nUserId: created.user.id,
    apiKey: "",
    email,
    password,
  });
  return saved;
}