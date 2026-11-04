import { getSession } from "auth/server";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const n8nUser = await ensureN8nUser(session);
  const result = await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").runWorkflow(id);
  return Response.json(result);
}