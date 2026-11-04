import "load-env";
import { sandboxTool } from "lib/ai/tools/sandbox/sandbox-tool";
import { resetThreadSandbox } from "lib/sandbox/session";

const threadId = `tool-probe-${Date.now()}`;
const tool: any = sandboxTool({ userId: "tool-probe", threadId });
const call = (input: any) => tool.execute(input, {} as any);

const main = async () => {
  const w = await call({
    action: "write_many",
    env: "web",
    files: [
      {
        path: "app/index.js",
        content: "const PORT = 3000;\nconsole.log(PORT);\n",
      },
      {
        path: "app/package.json",
        content: '{"name":"probe","version":"1.0.0"}',
      },
      { path: "app/README.md", content: "# probe\n" },
    ],
  });
  console.log(
    "write_many:",
    JSON.stringify({ written: w.written, bytes: w.bytes }),
  );
  console.log("environment briefing present:", Boolean(w.environment));
  if (w.environment)
    console.log(w.environment.split("\n").slice(0, 3).join("\n"));

  const e1 = await call({
    action: "edit",
    env: "web",
    path: "app/index.js",
    find: "3000",
    replace: "8080",
  });
  console.log("edit:", JSON.stringify(e1));

  const e2 = await call({
    action: "edit",
    env: "web",
    path: "app/index.js",
    find: "PORT",
    replace: "X",
  });
  console.log(
    "ambiguous edit rejected:",
    e2.error === "ambiguous",
    "|",
    e2.message?.slice(0, 60),
  );

  const e3 = await call({
    action: "edit",
    env: "web",
    path: "app/index.js",
    find: "nope",
    replace: "x",
  });
  console.log("missing text rejected:", e3.error === "not-found");

  const r = await call({ action: "read", env: "web", path: "app/index.js" });
  console.log("file now:", JSON.stringify(r.content));

  const bad = await call({
    action: "run",
    env: "nonexistent-env",
    command: "echo hi",
  });
  console.log("unknown env warning:", (bad.warning ?? "").slice(0, 70));

  await resetThreadSandbox(threadId);
  console.log("cleaned up");
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
