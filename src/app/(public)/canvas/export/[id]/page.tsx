import { redirect } from "next/navigation";

// Back-compat: E Canvas share links created before the /ecanvas rename
// pointed at /canvas/export/:id. Keep them resolving.
export const dynamic = "force-dynamic";

export default async function LegacyCanvasExportRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/ecanvas/export/${id}`);
}
