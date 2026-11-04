import "load-env";
import { Sandbox } from "e2b";

const main = async () => {
  for (const state of [["running"], ["paused"]] as const) {
    const items = await Sandbox.list({
      query: { state: [...state] },
    }).nextItems();
    console.log(`\n=== ${state[0]} (${items.length}) ===`);
    for (const s of items as any[]) {
      console.log(
        `${s.sandboxId}  template=${s.templateId ?? "?"}  started=${s.startedAt ?? "?"}  ` +
          `end=${s.endAt ?? "?"}\n   metadata=${JSON.stringify(s.metadata ?? {})}`,
      );
    }
  }
};
main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
