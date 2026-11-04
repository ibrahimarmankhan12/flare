import BuildDetail from "@/components/build/build-detail";
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
    return redirect("/sign-in");
  }
  const { id } = await params;
  return <BuildDetail id={id} />;
}
