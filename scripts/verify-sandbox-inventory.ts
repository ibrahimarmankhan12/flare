import "load-env";
import { getThreadSandbox, resetThreadSandbox } from "lib/sandbox/session";
import {
  assertSandboxOwned,
  listUserSandboxes,
  pauseSandboxById,
  resumeSandbox,
} from "lib/sandbox/inventory";

const userId = "inv-probe-user";
const otherUser = "someone-else";
const threadId = `inv-probe-${Date.now()}`;

const main = async () => {
  const { sandbox } = await getThreadSandbox({
    threadId,
    userId,
    env: "python",
  });
  const id = sandbox.sandboxId;
  await sandbox.files.write("/home/user/work/keep.txt", "still here");
  console.log("created", id);

  let list = await listUserSandboxes(userId);
  const mine = list.find((s) => s.sandboxId === id)!;
  console.log(
    "listed:",
    JSON.stringify({
      state: mine.state,
      env: mine.env,
      envLabel: mine.envLabel,
      feature: mine.feature,
      threadId: mine.threadId === threadId,
      expiresAt: Boolean(mine.expiresAt),
    }),
  );

  console.log(
    "owned by other user?",
    Boolean(await assertSandboxOwned(id, otherUser)),
    "(must be false)",
  );
  console.log(
    "owned by me?",
    Boolean(await assertSandboxOwned(id, userId)),
    "(must be true)",
  );

  await pauseSandboxById(id);
  list = await listUserSandboxes(userId);
  console.log(
    "after pause, state =",
    list.find((s) => s.sandboxId === id)?.state,
  );

  const { expiresAt } = await resumeSandbox(id);
  list = await listUserSandboxes(userId);
  console.log(
    "after resume, state =",
    list.find((s) => s.sandboxId === id)?.state,
    "| new lease:",
    expiresAt,
  );

  const back = await getThreadSandbox({ threadId, userId, env: "python" });
  const r = await back.sandbox.commands.run(
    "cat /home/user/work/keep.txt; python3 -c 'import pandas;print(pandas.__version__)'",
  );
  console.log(
    "files + toolchain after resume:",
    JSON.stringify(r.stdout.trim()),
  );

  await resetThreadSandbox(threadId);
  console.log("cleaned up");
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
