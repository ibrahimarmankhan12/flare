import "load-env";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";

const main = async () => {
  const tools: any = await loadAppDefaultTools({
    userId: "probe",
    threadId: "t",
  });
  let bad = 0;
  for (const [name, tool] of Object.entries<any>(tools)) {
    const schema = tool?.inputSchema as any;
    const req = schema?.required;
    const t = typeof req;
    if (req !== undefined && !Array.isArray(req)) {
      bad++;
      console.log(
        `BAD  ${name}: typeof inputSchema.required = ${t}` +
          (t === "function" ? "  <-- new Set(fn) throws here" : ""),
      );
      console.log(
        `     schema keys: ${Object.keys(schema ?? {})
          .slice(0, 12)
          .join(", ")}`,
      );
    }
  }
  console.log(
    `\nchecked ${Object.keys(tools).length} tools, ${bad} with non-array 'required'`,
  );
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
