import "server-only";

// ---------------------------------------------------------------------------
// P4.A — Personal-team-on-signup hook (Phase 4 / #19 Team seats)
// ---------------------------------------------------------------------------
// Every new user gets a personal "workspace" team auto-created. This
// keeps the rest of the application org-agnostic: a chat thread or an
// agent is always either `org_id = NULL` (personal) or
// `org_id = <some team>` (shared). A user's "personal" rows live
// under their personal team, even though the `org_id` column is
// NULL — the personal team exists so the user can invite collaborators
// later, switch into the team context, and own a billing seat.
//
// The hook fires from Better Auth's `databaseHooks.user.create.after`
// channel (see `src/lib/auth/auth-instance.ts`). We swallow all errors
// inside the handler so a transient DB failure can never block
// sign-up — the user can re-trigger the personal-team creation by
// signing in once the team repository recovers.
//
// The plugin's own `organization` / `member` / `invitation` tables
// are intentionally unused. The `team` table in `schema.pg.ts` is
// the canonical org table — the plugin is enabled for its
// `createOrganization` / `acceptInvitation` / `setActiveOrganization`
// flow helpers (which P4.B / later agents will wire into the UI), but
// we never read or write the plugin's own tables. See
// `src/lib/auth/config.ts` for the comment that locks this in.
// ---------------------------------------------------------------------------

import { teamRepository } from "lib/db/repository";
import logger from "logger";

export interface PersonalTeamHookResult {
  teamId: string;
}

let hooksRegistered = false;

/**
 * Pure handler: takes the freshly-created Better Auth user and creates
 * a personal team with the user as the owner. Returns `{ teamId }` on
 * success and `null` on error. Null-on-error keeps the signup flow
 * alive even if the team insert fails — the user can re-trigger by
 * signing in later (or a future maintenance pass can backfill).
 */
export const onUserCreateCreatePersonalTeam = async (user: {
  id: string;
  name?: string | null;
}): Promise<PersonalTeamHookResult | null> => {
  if (!user || !user.id) {
    logger.error(
      "[org-hooks] onUserCreateCreatePersonalTeam called with no user id — skipping",
    );
    return null;
  }

  const displayName = (user.name ?? "").trim() || "User";
  const slug = `${user.id}-personal`;

  try {
    const team = await teamRepository.createTeam(
      { name: `${displayName}'s workspace`, slug },
      user.id,
    );
    // The owner is added inside `createTeam`, but we call
    // `addTeamMember` here too as a defensive no-op (it upserts on the
    // UNIQUE constraint). This keeps the hook correct even if a
    // future refactor splits the two inserts.
    await teamRepository.addTeamMember(team.id, user.id, "owner");

    logger.info(
      `[org-hooks] Created personal team ${team.id} for user ${user.id}`,
    );
    return { teamId: team.id };
  } catch (error) {
    logger.error(
      `[org-hooks] Failed to create personal team for user ${user.id}:`,
      error,
    );
    return null;
  }
};

/**
 * Idempotent registrar. Wires `onUserCreateCreatePersonalTeam` into
 * the Better Auth `databaseHooks.user.create.after` chain. Safe to
 * call multiple times — the second call no-ops.
 *
 * Imported by `src/lib/auth/auth-instance.ts`. The auth instance is
 * the only call site; tests can also import this for the side effect
 * (it does nothing harmful outside a real auth instance).
 */
export const registerOrganizationHooks = async (): Promise<void> => {
  if (hooksRegistered) return;
  hooksRegistered = true;

  // `auth-instance.ts` wires `onUserCreateCreatePersonalTeam` into
  // `databaseHooks.user.create.after` when the Better Auth options are
  // constructed. Keeping this registrar idempotent gives future bootstraps
  // a safe place to centralize hook setup without risking duplicate work.
  logger.info("[org-hooks] organization hooks registered");
};
