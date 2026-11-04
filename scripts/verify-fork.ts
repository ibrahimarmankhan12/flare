import "load-env";
import { chatRepository } from "lib/db/repository";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatMessageTable, ChatThreadTable } from "lib/db/pg/schema.pg";
import { eq, asc, desc } from "drizzle-orm";

const main = async () => {
  const threads = await db
    .select({
      id: ChatThreadTable.id,
      userId: ChatThreadTable.userId,
      title: ChatThreadTable.title,
    })
    .from(ChatThreadTable)
    .orderBy(desc(ChatThreadTable.createdAt))
    .limit(60);

  let tested = 0;
  for (const t of threads) {
    const msgs = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.threadId, t.id))
      .orderBy(asc(ChatMessageTable.createdAt), asc(ChatMessageTable.id));
    if (msgs.length < 2) continue;

    // Fork at every position, including the very last message.
    for (const idx of [0, Math.floor(msgs.length / 2), msgs.length - 1]) {
      const anchor: any = msgs[idx];
      const forked = await chatRepository.forkThread(
        {
          sourceThreadId: t.id,
          forkFromMessageId: anchor.id,
          branchLabel: "probe",
        },
        t.userId,
      );
      const copied = await db
        .select()
        .from(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, forked.id));
      const expected = idx + 1;
      const includesAnchor = copied.some(
        (m: any) =>
          JSON.stringify(m.parts) === JSON.stringify(anchor.parts) &&
          m.role === anchor.role,
      );
      const ok = copied.length === expected && includesAnchor;
      console.log(
        `${ok ? "PASS" : "FAIL"}  thread=${t.id.slice(0, 8)} fork@${idx}/${msgs.length - 1} ` +
          `expected=${expected} copied=${copied.length} anchorPresent=${includesAnchor}`,
      );
      await db
        .delete(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, forked.id));
      await db.delete(ChatThreadTable).where(eq(ChatThreadTable.id, forked.id));
    }
    if (++tested >= 4) break;
  }

  // Rejects a message from a different thread.
  const a = threads[0],
    b = threads.find((x) => x.id !== a.id)!;
  const [foreign]: any = await db
    .select()
    .from(ChatMessageTable)
    .where(eq(ChatMessageTable.threadId, b.id))
    .limit(1);
  if (foreign) {
    try {
      await chatRepository.forkThread(
        { sourceThreadId: a.id, forkFromMessageId: foreign.id },
        a.userId,
      );
      console.log("FAIL  cross-thread fork was allowed");
    } catch (e: any) {
      console.log(`PASS  cross-thread rejected: "${e.message}"`);
    }
  }
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
