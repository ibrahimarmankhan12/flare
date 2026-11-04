import { getSession } from "auth/server";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const n8nUser = await ensureN8nUser(session);
  const workflow = await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").getWorkflow(id);
  return Response.json(workflow);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { name, description, active } = await request.json();

  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const n8nUser = await ensureN8nUser(session);
  const workflow = await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").updateWorkflow(id, {
    name,
    description,
    active,
  });
  return Response.json(workflow);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const n8nUser = await ensureN8nUser(session);
  await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").deleteWorkflow(id);
  return Response.json({ success: true });
}