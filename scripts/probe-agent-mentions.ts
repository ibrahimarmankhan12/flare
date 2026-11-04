import "load-env";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";

const main = async () => {
  const cases: [string, string[]][] = [
    ["Data & Table Generator", ["javascriptExecution", "createTable"]],
    ["Code Assistant (2b41)", ["javascriptExecution"]],
    ["DevOps Engineer", ["createBarChart", "createLineChart", "createTable"]],
  ];
  for (const [label, names] of cases) {
    const tools: any = await loadAppDefaultTools({
      userId: "probe",
      threadId: "t",
      mentions: names.map((name) => ({ type: "defaultTool", name })) as any,
    });
    const got = Object.keys(tools);
    console.log(`${label}`);
    console.log(`   mentioned: ${names.join(", ")}`);
    console.log(
      `   resolved : ${got.length ? got.join(", ") : "*** NOTHING ***"}`,
    );
    const lost = names.filter((n) => !got.includes(n));
    if (lost.length) console.log(`   unmatched: ${lost.join(", ")}`);
  }
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
