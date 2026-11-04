import { getSession } from "auth/server";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import { notFound, redirect } from "next/navigation";
import N8nWorkflowEmbed from "@/components/workflow/n8n-workflow-embed";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  let workflow;
  try {
    const n8nUser = await ensureN8nUser(session);
    workflow = await createUserClient(n8nUser.email ?? session.user.email ?? "", n8nUser.password ?? "").getWorkflow(id);
  } catch {
    notFound();
  }

  return (
    <N8nWorkflowEmbed
      workflowId={id}
      workflowName={workflow.name}
      active={workflow.active}
    />
  );
}