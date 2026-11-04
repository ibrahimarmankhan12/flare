import { redirect } from "next/navigation";

// Back-compat for shared canvas links created before the /ecanvas rename.
export const dynamic = "force-dynamic";

export default async function LegacyCanvasIdRedirect({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  redirect(`/ecanvas/${canvasId}`);
}
