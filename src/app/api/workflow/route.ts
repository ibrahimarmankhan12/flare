import { getSession } from "auth/server";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json([]);
  }
  const n8nUser = await ensureN8nUser(session);
  const workflows = await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").listWorkflows();
  return Response.json(workflows);
}

export async function POST(request: Request) {
  const { name, description } = await request.json();

  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const n8nUser = await ensureN8nUser(session);
  const workflow = await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").createWorkflow(
    name ?? "New workflow",
    description,
  );
  return Response.json(workflow);
}