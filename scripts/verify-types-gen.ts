import "load-env";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";
import {
  extractToolInfo,
  generateTypesFromTools,
} from "lib/ai/tools/code-engine/types-gen";

const main = async () => {
  const tools: any = await loadAppDefaultTools({
    userId: "probe",
    threadId: "t",
  });
  const infos = extractToolInfo(tools);
  console.log(`tools: ${infos.length}`);
  const withSchema = infos.filter((i) => i.inputSchema).length;
  console.log(`with usable schema: ${withSchema}`);
  const stillBad = infos.filter(
    (i) =>
      i.inputSchema &&
      i.inputSchema.required !== undefined &&
      !Array.isArray(i.inputSchema.required),
  ).length;
  console.log(`non-array required remaining: ${stillBad}`);

  const out = generateTypesFromTools(infos);
  console.log(`generated ${out.length} chars, no throw`);
  const pie = out
    .split("\n\n")
    .find((b) => b.startsWith("type CreatePieChartInput"));
  console.log("--- sample ---");
  console.log(pie);
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
