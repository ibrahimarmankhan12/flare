import "load-env";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";

const main = async () => {
  const tools: any = await loadAppDefaultTools({
    userId: "probe",
    threadId: "t",
  });
  const [name, tool] = Object.entries<any>(tools).find(
    ([, t]) => t?.inputSchema && !Array.isArray(t.inputSchema.required),
  )!;
  const s: any = tool.inputSchema;
  console.log("tool:", name);
  console.log("typeof s.toJSONSchema :", typeof s.toJSONSchema);
  console.log("s.def?              :", typeof s.def);
  console.log("s['~standard']?     :", typeof s["~standard"]);

  try {
    const js = s.toJSONSchema();
    console.log("instance .toJSONSchema() OK");
    console.log("  type     :", js.type);
    console.log("  required :", JSON.stringify(js.required));
    console.log(
      "  props    :",
      Object.keys(js.properties ?? {})
        .join(", ")
        .slice(0, 120),
    );
  } catch (e: any) {
    console.log("instance .toJSONSchema() FAILED:", e?.message);
  }

  try {
    const z = await import("zod");
    const js2 = (z as any).toJSONSchema(s);
    console.log(
      "z.toJSONSchema(s) OK, required =",
      JSON.stringify(js2.required),
    );
  } catch (e: any) {
    console.log("z.toJSONSchema(s) FAILED:", e?.message);
  }

  // How many convert cleanly?
  let ok = 0,
    fail = 0;
  for (const [, t] of Object.entries<any>(tools)) {
    const sc: any = t?.inputSchema;
    if (!sc) continue;
    if (Array.isArray(sc.required) || !sc.def) {
      ok++;
      continue;
    }
    try {
      const j = sc.toJSONSchema();
      Array.isArray(j.required) || j.required === undefined ? ok++ : fail++;
    } catch {
      fail++;
    }
  }
  console.log(`\nconvertible: ${ok}, still bad: ${fail}`);
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
