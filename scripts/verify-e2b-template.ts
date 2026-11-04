import "load-env";
import { Sandbox } from "e2b";
import { SANDBOX_ENVIRONMENTS } from "lib/sandbox/templates";

const name = process.argv[2] || "flare-python";
const probe =
  process.argv[3] ||
  "python3 -c 'import pandas,sklearn;print(pandas.__version__, sklearn.__version__)'";

const main = async () => {
  const t0 = Date.now();
  // Spawn exactly as session.ts does, envs included - a probe without them
  // reports false failures (rustup with no RUSTUP_HOME finds no toolchain).
  const env = SANDBOX_ENVIRONMENTS.find((e) => e.template === name);
  const sbx = await Sandbox.create({
    template: name,
    ...(env?.envs ? { envs: env.envs } : {}),
    timeoutMs: 300_000,
  });
  console.log(`spawned ${name} in ${Date.now() - t0}ms -> ${sbx.sandboxId}`);
  const who = await sbx.commands.run("whoami; pwd; id -u");
  console.log("identity:", who.stdout.trim().replace(/\n/g, " | "));
  const w = await sbx.commands
    .run("touch /home/user/work/_probe && echo writable")
    .catch((e: any) => e?.result);
  console.log("workdir:", (w?.stdout || w?.stderr || "").trim());
  const r = await sbx.commands
    .run(probe)
    .catch(
      (e: any) => e?.result ?? { stdout: "", stderr: String(e), exitCode: 1 },
    );
  console.log("probe exit:", r.exitCode);
  console.log("stdout:", (r.stdout || "").trim().slice(0, 800));
  if (r.stderr) console.log("stderr:", r.stderr.trim().slice(0, 500));
  await Sandbox.kill(sbx.sandboxId);
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
