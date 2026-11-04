import "load-env";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";
import { createCodeEngineTool } from "lib/ai/tools/code-engine";
import { NodeVMExecutor } from "lib/ai/tools/code-engine/executor";

const main = async () => {
  const tools: any = await loadAppDefaultTools({
    userId: "probe",
    threadId: "t",
  });
  console.log(
    `building code-engine over ${Object.keys(tools).length} tools ...`,
  );
  const executor = new NodeVMExecutor({ timeout: 60000 });
  const ce: any = createCodeEngineTool(tools, executor);
  console.log("createCodeEngineTool: OK, no throw");
  const desc = String(ce?.description ?? "");
  console.log("description length:", desc.length);
  console.log(
    "declares flare namespace:",
    desc.includes("declare const flare"),
  );
};
main().catch((e) => {
  console.error("STILL BROKEN:", e?.message ?? e);
  process.exit(1);
});
