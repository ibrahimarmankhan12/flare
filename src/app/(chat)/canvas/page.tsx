import { redirect } from "next/navigation";

// Back-compat: the sketch canvas moved to /ecanvas ("E Canvas") to keep it
// clearly distinct from the PPT-maker Canvas tool. Old links still work.
export const dynamic = "force-dynamic";

export default function LegacyCanvasRedirect() {
  redirect("/ecanvas");
}
