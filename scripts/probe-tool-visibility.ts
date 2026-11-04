import "load-env";
import { AppDefaultToolkit } from "lib/ai/tools";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";

// What the model is actually handed, versus what exists.
const DEFAULT_ON = [
  AppDefaultToolkit.Code,
  AppDefaultToolkit.Visualization,
  AppDefaultToolkit.Video,
  AppDefaultToolkit.Artifacts,
  AppDefaultToolkit.Canvas,
  AppDefaultToolkit.Memory,
];

const main = async () => {
  const all = await loadAppDefaultTools({ userId: "probe", threadId: "t" });
  const def = await loadAppDefaultTools({
    userId: "probe",
    threadId: "t",
    allowedAppDefaultToolkit: DEFAULT_ON,
  });
  const allNames = Object.keys(all ?? {});
  const defNames = Object.keys(def ?? {});
  console.log("toolkits that exist :", Object.values(AppDefaultToolkit).length);
  console.log(
    "toolkits on by default:",
    DEFAULT_ON.length,
    "->",
    DEFAULT_ON.join(", "),
  );
  console.log(
    "toolkits OFF by default:",
    Object.values(AppDefaultToolkit)
      .filter((t) => !DEFAULT_ON.includes(t as any))
      .join(", "),
  );
  console.log();
  console.log("tools available in total :", allNames.length);
  console.log("tools the model sees by default:", defNames.length);
  console.log();
  const hidden = allNames.filter((n) => !defNames.includes(n));
  console.log("hidden unless the user toggles a toolkit on:");
  console.log("  " + hidden.join(", ").slice(0, 1400));
  console.log();
  console.log("visible by default:");
  console.log("  " + defNames.join(", "));
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
