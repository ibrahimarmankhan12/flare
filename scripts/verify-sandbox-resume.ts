import "load-env";
import { Sandbox } from "e2b";
import { getThreadSandbox } from "lib/sandbox/session";

const threadId = `resume-probe-${Date.now()}`;
const userId = "probe";

const main = async () => {
  // 1. create via the real Flare path
  const a = await getThreadSandbox({ threadId, userId, env: "base" });
  console.log(`created ${a.sandbox.sandboxId} (created=${a.created})`);
  await a.sandbox.files.write(
    "/home/user/work/state.txt",
    "survived-the-pause",
  );
  await a.sandbox.commands.run("echo 'pkg installed' > /home/user/work/marker");

  // 2. pause it, as onTimeout:'pause' would after the idle lease
  await a.sandbox.pause();
  console.log("paused");
  const paused = await Sandbox.list({
    query: { state: ["paused"] },
  }).nextItems();
  console.log(
    "visible while paused:",
    (paused as any[]).some((s) => s.sandboxId === a.sandbox.sandboxId),
  );

  // 3. reconnect through the same path a later tool call would take
  const t0 = Date.now();
  const b = await getThreadSandbox({ threadId, userId, env: "base" });
  console.log(
    `reconnected in ${Date.now() - t0}ms -> ${b.sandbox.sandboxId} (created=${b.created})`,
  );
  console.log("same sandbox:", b.sandbox.sandboxId === a.sandbox.sandboxId);

  // 4. is the filesystem still there?
  const r = await b.sandbox.commands.run(
    "cat /home/user/work/state.txt; cat /home/user/work/marker",
  );
  console.log("filesystem after resume:", JSON.stringify(r.stdout.trim()));

  // 5. simulate a Flare restart: metadata-only discovery, empty in-process cache
  const { resetThreadSandbox } = await import("lib/sandbox/session");
  const found = await Sandbox.list({
    query: {
      metadata: { app: "flare", feature: "tool", threadId },
      state: ["running", "paused"],
    },
  }).nextItems();
  console.log("discoverable by metadata alone:", (found as any[]).length === 1);

  await resetThreadSandbox(threadId);
  console.log("cleaned up");
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
