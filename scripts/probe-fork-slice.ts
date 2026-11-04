import "load-env";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatMessageTable } from "lib/db/pg/schema.pg";
import { eq, and, lte, asc } from "drizzle-orm";

const THREAD = "8d39b9ec-6aa3-4929-87e8-876bc58baf0f";
const FORK = "921af64d-868b-4c13-bb61-1717dbafc046";

const main = async () => {
  const [forkPoint] = await db
    .select()
    .from(ChatMessageTable)
    .where(eq(ChatMessageTable.id, FORK));
  console.log(
    "forkPoint.createdAt =",
    forkPoint.createdAt,
    "| type:",
    Object.prototype.toString.call(forkPoint.createdAt),
    "| iso:",
    (forkPoint.createdAt as any)?.toISOString?.(),
  );

  const all = await db
    .select()
    .from(ChatMessageTable)
    .where(eq(ChatMessageTable.threadId, THREAD))
    .orderBy(asc(ChatMessageTable.createdAt));
  console.log(
    "all messages in thread:",
    all.length,
    all.map((m: any) => `${m.role}@${m.createdAt.toISOString()}`),
  );

  const sliced = await db
    .select()
    .from(ChatMessageTable)
    .where(
      and(
        eq(ChatMessageTable.threadId, THREAD),
        lte(ChatMessageTable.createdAt, forkPoint.createdAt),
      ),
    )
    .orderBy(asc(ChatMessageTable.createdAt));
  console.log(
    "lte slice returned:",
    sliced.length,
    sliced.map((m: any) => `${m.role}@${m.createdAt.toISOString()}`),
  );

  console.log(
    "process TZ =",
    process.env.TZ ?? "(unset)",
    "| node offset mins =",
    new Date().getTimezoneOffset(),
  );
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
