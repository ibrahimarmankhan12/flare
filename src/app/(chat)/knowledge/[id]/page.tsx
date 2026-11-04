import KnowledgeDetail from "@/components/knowledge-detail";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.user) {
    return redirect("/login");
  }
  const { id } = await params;
  return <KnowledgeDetail id={id} />;
}
