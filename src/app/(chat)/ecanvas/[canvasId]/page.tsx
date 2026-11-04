import { App as CanvasApp } from "@/components/canvas/ecanvas/App";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CanvasByIdPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  const session = await getSession();

  if (!session?.user) {
    redirect("/sign-in");
  }

  return <CanvasApp canvasId={canvasId} />;
}
