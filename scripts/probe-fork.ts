import "load-env";
import { chatRepository } from "lib/db/repository";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatMessageTable, ChatThreadTable } from "lib/db/pg/schema.pg";
import { eq, desc } from "drizzle-orm";

const main = async () => {
  // Pick a real thread that actually has messages.
  const rows = await db
    .select({
      id: ChatThreadTable.id,
      userId: ChatThreadTable.userId,
      title: ChatThreadTable.title,
    })
    .from(ChatThreadTable)
    .orderBy(desc(ChatThreadTable.createdAt))
    .limit(30);

  for (const t of rows) {
    const msgs = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.threadId, t.id));
    if (msgs.length < 2) continue;
    const assistant = msgs.find((m: any) => m.role === "assistant");
    if (!assistant) continue;

    console.log(`source thread ${t.id} "${t.title}" msgs=${msgs.length}`);
    console.log(`fork point   ${assistant.id} (role=${assistant.role})`);
    try {
      const forked = await chatRepository.forkThread(
        {
          sourceThreadId: t.id,
          forkFromMessageId: assistant.id,
          branchLabel: "probe",
        },
        t.userId,
      );
      console.log("FORK OK ->", forked.id, JSON.stringify(forked.title));
      const copied = await db
        .select()
        .from(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, forked.id));
      console.log("messages copied:", copied.length);
      // clean up the probe fork
      await db
        .delete(ChatMessageTable)
        .where(eq(ChatMessageTable.threadId, forked.id));
      await db.delete(ChatThreadTable).where(eq(ChatThreadTable.id, forked.id));
      console.log("cleaned up");
    } catch (e: any) {
      console.log("FORK FAILED:", e?.message);
      console.log(e?.stack?.split("\n").slice(0, 6).join("\n"));
    }
    return;
  }
  console.log("no suitable thread found");
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
