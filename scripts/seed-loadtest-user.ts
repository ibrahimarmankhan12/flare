#!/usr/bin/env tsx
/**
 * Seed a load-test user with 50 realistic memories.
 *
 * The user is created with a deterministic UUID so the load-test endpoint
 * can be configured via `LOADTEST_USER_ID` once and reused across runs.
 * The memories are intentionally varied (categories, lengths) so the system
 * prompt assembly exercises a realistic case.
 *
 * Usage:
 *   pnpm seed:loadtest                # default user, 50 memories
 *   pnpm seed:loadtest -- --reset     # drop the user and start over
 *   pnpm seed:loadtest -- --count 200 # different memory count
 */
import { config } from "dotenv";

if (process.env.CI) {
  config({ path: ".env.test" });
} else {
  config();
}

import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { MemoryTable, UserTable } from "lib/db/pg/schema.pg";
import { pgDb } from "lib/db/pg/db.pg";

const DEFAULT_LOADTEST_USER_ID = "00000000-0000-4000-8000-00000000load" as const;
const DEFAULT_LOADTEST_EMAIL = "loadtest@flare.local" as const;
const DEFAULT_COUNT = 50;

const CATEGORIES = [
  "identity",
  "career",
  "projects",
  "preferences",
  "instructions",
  "context",
] as const;

const SAMPLE_MEMORIES: Array<{ category: (typeof CATEGORIES)[number]; content: string }> = [
  { category: "identity", content: "Prefers to be called 'Karthik' rather than 'K'." },
  { category: "identity", content: "Lives in Bangalore, India; IST timezone (UTC+5:30)." },
  { category: "identity", content: "Speaks English and Tamil; reads Hindi but rarely writes it." },
  { category: "career", content: "Senior software engineer at a fintech; 8 years of full-stack experience." },
  { category: "career", content: "Currently focused on distributed systems and Postgres internals." },
  { category: "career", content: "Previously worked at two early-stage startups, one as a founding engineer." },
  { category: "projects", content: "Flare AI — a multi-LLM chat platform with MCP integration; open source." },
  { category: "projects", content: "Side project: a real-time collaborative whiteboard in Rust + WebRTC." },
  { category: "preferences", content: "Always wants code examples in TypeScript unless asked otherwise." },
  { category: "preferences", content: "Prefers concise answers; asks for depth only when requested." },
  { category: "preferences", content: "Dislikes marketing-speak; appreciates direct, specific responses." },
  { category: "instructions", content: "Never repeat the user's name more than once per response." },
  { category: "instructions", content: "When suggesting a library, always mention the latest stable version." },
  { category: "instructions", content: "When explaining a concept, give one concrete example first, theory second." },
  { category: "context", content: "Currently debugging a Postgres query planner regression after upgrading to 16." },
  { category: "context", content: "Has a flight to Tokyo on the 14th; will be offline for ~36 hours." },
];

const fillToCount = (count: number) => {
  const out = [...SAMPLE_MEMORIES];
  let i = 0;
  while (out.length < count) {
    const seed = SAMPLE_MEMORIES[i % SAMPLE_MEMORIES.length];
    out.push({
      category: seed.category,
      content: `${seed.content} (variant ${Math.floor(i / SAMPLE_MEMORIES.length) + 1})`,
    });
    i += 1;
  }
  return out.slice(0, count);
};

const main = async () => {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag);
  const getArg = (flag: string, fallback: string) => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? fallback : (argv[idx + 1] ?? fallback);
  };

  const userId = getArg("--userId", DEFAULT_LOADTEST_USER_ID);
  const email = getArg("--email", DEFAULT_LOADTEST_EMAIL);
  const count = Number.parseInt(getArg("--count", `${DEFAULT_COUNT}`), 10);
  const reset = hasFlag("--reset");

  console.log(`Seeding load-test user  id=${userId}  email=${email}  count=${count}`);

  if (reset) {
    console.log("  --reset: deleting existing user and memories");
    await pgDb
      .delete(MemoryTable)
      .where(eq(MemoryTable.userId, userId));
    await pgDb.delete(UserTable).where(eq(UserTable.id, userId));
  }

  // Upsert the user.
  const existing = await pgDb
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.id, userId))
    .limit(1);

  if (existing.length === 0) {
    await pgDb.insert(UserTable).values({
      id: userId,
      name: "Load Test",
      email,
      emailVerified: true,
      role: "user",
      tier: "free",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("  ✓ user created");
  } else {
    console.log("  • user already exists, skipping insert");
  }

  // Wipe and reinsert memories to make the count deterministic.
  await pgDb.delete(MemoryTable).where(eq(MemoryTable.userId, userId));
  const memories = fillToCount(count);
  await pgDb.insert(MemoryTable).values(
    memories.map((m) => ({
      userId,
      content: m.content,
      category: m.category,
    })),
  );
  console.log(`  ✓ ${memories.length} memories inserted`);

  // Print the current memory count for confirmation.
  const result = await pgDb.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM ${MemoryTable} WHERE user_id = ${userId}`,
  );
  const total = (result as unknown as Array<{ count: string }>)[0]?.count ?? "?";
  console.log(`  ✓ row count: ${total}`);

  console.log("");
  console.log("Run the load test:");
  console.log(`  LOADTEST_ENABLED=1 LOADTEST_USER_ID=${userId} pnpm dev`);
  console.log(`  pnpm loadtest -- --userId ${userId}`);
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
