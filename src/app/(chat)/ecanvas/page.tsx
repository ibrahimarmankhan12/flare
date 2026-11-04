import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getSession } from "auth/server";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/sign-in");
  }

  redirect(`/ecanvas/${randomUUID()}`);
}
