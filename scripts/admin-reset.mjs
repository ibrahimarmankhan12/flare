/**
 * One-shot admin credential reset.
 *
 * Usage: node scripts/admin-reset.mjs
 *
 * Reads POSTGRES_URL from /etc/flare.env, hashes the new password
 * using Better Auth's scrypt (so the format matches the rest of the
 * user table), and updates the user + credential account.
 */
import { scrypt as _scryptUnused } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Load env from /etc/flare.env
const envFile = readFileSync("/etc/flare.env", "utf8");
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq).trim();
  // Strip surrounding quotes from value
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const NEW_EMAIL = "admin@flare.ai";
const NEW_PASSWORD = "zv123";

// Use Better Auth's own hasher to keep the format identical.
const { hashPassword } = require(
  "/home/ubuntu/flare-main/node_modules/.pnpm/@better-auth+utils@0.4.0/node_modules/@better-auth/utils/dist/password.node.mjs",
);

const client = new Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();

try {
  // 1) Find the admin user
  const userRes = await client.query(
    `SELECT id, email, role FROM "user" WHERE role = 'admin' ORDER BY created_at LIMIT 1`,
  );
  if (userRes.rowCount === 0) {
    console.error("No admin user found.");
    process.exit(1);
  }
  const admin = userRes.rows[0];
  console.log(`[admin] target user: id=${admin.id} email=${admin.email} role=${admin.role}`);

  // 2) Hash the new password
  const passwordHash = await hashPassword(NEW_PASSWORD);
  console.log(`[admin] generated scrypt hash (${passwordHash.length} chars)`);

  // 3) Update the user record
  const userUpdate = await client.query(
    `UPDATE "user"
       SET email = $1,
           password = $2,
           "email_verified" = true,
           "updated_at" = NOW()
     WHERE id = $3
     RETURNING id, email, role`,
    [NEW_EMAIL, passwordHash, admin.id],
  );
  console.log(`[admin] user updated:`, userUpdate.rows[0]);

  // 4) Update the credential account password (Better Auth stores it
  //    on the account row, not on the user row, for credential logins).
  const accountUpdate = await client.query(
    `UPDATE account
       SET password = $1,
           "updated_at" = NOW()
     WHERE "user_id" = $2 AND "provider_id" = 'credential'
     RETURNING id, "account_id", "provider_id"`,
    [passwordHash, admin.id],
  );
  if (accountUpdate.rowCount === 0) {
    console.log("[admin] no credential account found — skipped");
  } else {
    console.log(`[admin] account updated:`, accountUpdate.rows[0]);
  }

  // 5) Invalidate any existing sessions for the admin so the new
  //    password takes effect immediately.
  const sessionRes = await client.query(
    `DELETE FROM session WHERE "user_id" = $1 RETURNING id`,
    [admin.id],
  );
  console.log(`[admin] invalidated ${sessionRes.rowCount} existing session(s)`);

  console.log("\n[done] admin credentials are now:");
  console.log(`  email:    ${NEW_EMAIL}`);
  console.log(`  password: ${NEW_PASSWORD}`);
} catch (error) {
  console.error("[error]", error);
  process.exit(1);
} finally {
  await client.end();
}
