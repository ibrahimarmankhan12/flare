import BuildDashboard from "@/components/build/build-dashboard";
import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session?.user) {
    return redirect("/sign-in");
  }
  // Builds are attached to a conversation; use the most recent thread so the
  // page works standalone rather than only from inside a chat.
  const threads = await chatRepository
    .selectThreadsByUserId(session.user.id)
    .catch(() => []);
  return <BuildDashboard threadId={threads?.[0]?.id} />;
}
