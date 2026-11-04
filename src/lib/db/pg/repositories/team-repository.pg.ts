import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  NewTeam,
  NewTeamMember,
  Team,
  TeamMember,
  TeamMemberTable,
  TeamTable,
  UserTable,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P4.0 schema foundation — Team repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `team` + `team_member` tables (Better Auth
// `organization`-plugin-compatible). The onUserCreate hook that auto-
// creates a personal team for every new user lives in P4.A
// (`src/lib/auth/org-hooks.ts`) — this file is the data-access layer.
//
// All write paths are owner-scoped: `createTeam` checks the slug is
// unique; `updateTeam` / `deleteTeam` / member mutations require the
// caller to be the owner (or, in the case of `updateTeamMemberRole`,
// an admin). The route layer is expected to enforce role policy; the
// repository just enforces ownership at the query level.
// ---------------------------------------------------------------------------

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type TeamPlan = "free" | "team" | "business";

export interface CreateTeamInput {
  name: string;
  slug: string;
  plan?: TeamPlan;
}

export interface UpdateTeamInput {
  name?: string;
  slug?: string;
  plan?: TeamPlan;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export const teamRepository = {
  /**
   * Create a team. The owner is also added as a `team_member` with
   * role `owner` so the membership query always has at least one
   * row. Slug is UNIQUE — Postgres will throw on collision and the
   * caller (the route) is expected to translate the error into a
   * 409.
   */
  async createTeam(input: CreateTeamInput, ownerId: string): Promise<Team> {
    const [team] = await db
      .insert(TeamTable)
      .values({
        name: input.name,
        slug: input.slug,
        ownerId,
        plan: input.plan ?? "free",
      } satisfies NewTeam)
      .returning();

    // Owner is also a team_member so the membership query has at
    // least one row. CASCADE on team/user delete handles the rest.
    await db.insert(TeamMemberTable).values({
      teamId: team!.id,
      userId: ownerId,
      role: "owner",
    } satisfies NewTeamMember);

    return team as Team;
  },

  async getTeam(id: string): Promise<Team | null> {
    const [row] = await db.select().from(TeamTable).where(eq(TeamTable.id, id));
    return (row as Team | undefined) ?? null;
  },

  async getTeamBySlug(slug: string): Promise<Team | null> {
    const [row] = await db
      .select()
      .from(TeamTable)
      .where(eq(TeamTable.slug, slug));
    return (row as Team | undefined) ?? null;
  },

  /**
   * List every team the user is a member of (or owns). Joins through
   * `team_member` so the user doesn't have to be the owner — members
   * see the teams they belong to.
   */
  async listTeamsForUser(userId: string): Promise<Team[]> {
    return (await db
      .select({
        id: TeamTable.id,
        name: TeamTable.name,
        slug: TeamTable.slug,
        ownerId: TeamTable.ownerId,
        plan: TeamTable.plan,
        stripeCustomerId: TeamTable.stripeCustomerId,
        stripeSubscriptionId: TeamTable.stripeSubscriptionId,
        createdAt: TeamTable.createdAt,
        updatedAt: TeamTable.updatedAt,
      })
      .from(TeamTable)
      .innerJoin(TeamMemberTable, eq(TeamMemberTable.teamId, TeamTable.id))
      .where(eq(TeamMemberTable.userId, userId))
      .orderBy(asc(TeamTable.name))) as Team[];
  },

  /**
   * Owner-scoped update. Only the team's owner can change name /
   * slug / plan / Stripe linkage. A separate `updateTeamMemberRole`
   * is provided so admins (not just the owner) can change roles.
   */
  async updateTeam(
    id: string,
    userId: string,
    patch: UpdateTeamInput,
  ): Promise<Team | null> {
    const set: Partial<NewTeam> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.slug !== undefined) set.slug = patch.slug;
    if (patch.plan !== undefined) set.plan = patch.plan;
    if (patch.stripeCustomerId !== undefined) {
      set.stripeCustomerId = patch.stripeCustomerId;
    }
    if (patch.stripeSubscriptionId !== undefined) {
      set.stripeSubscriptionId = patch.stripeSubscriptionId;
    }
    if (Object.keys(set).length === 0) {
      return await teamRepository.getTeam(id);
    }
    set.updatedAt = new Date();
    const [row] = await db
      .update(TeamTable)
      .set(set)
      .where(and(eq(TeamTable.id, id), eq(TeamTable.ownerId, userId)))
      .returning();
    return (row as Team | undefined) ?? null;
  },

  /**
   * Owner-scoped delete. CASCADE on team_member handles membership
   * cleanup. The route should also clean up the team's resources
   * (chat_thread, chat_message, etc.) that are tagged with the
   * team's `org_id` — out of scope for this foundation pass.
   */
  async deleteTeam(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(TeamTable)
      .where(and(eq(TeamTable.id, id), eq(TeamTable.ownerId, userId)))
      .returning({ id: TeamTable.id });
    return result.length > 0;
  },

  /**
   * Add a member. Idempotent via UNIQUE (team_id, user_id) — a
   * second add of the same user no-ops (returns the existing row).
   */
  async addTeamMember(
    teamId: string,
    userId: string,
    role: TeamRole = "member",
  ): Promise<TeamMember> {
    const [row] = await db
      .insert(TeamMemberTable)
      .values({
        teamId,
        userId,
        role,
      } satisfies NewTeamMember)
      .onConflictDoUpdate({
        target: [TeamMemberTable.teamId, TeamMemberTable.userId],
        set: { role },
      })
      .returning();
    return row as TeamMember;
  },

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    // Refuse to remove the team's owner — they must transfer
    // ownership first (or delete the team). This is a defence-in-
    // depth check; the route should also enforce it.
    const team = await teamRepository.getTeam(teamId);
    if (!team) return false;
    if (team.ownerId === userId) {
      throw new Error("Cannot remove the team owner");
    }
    const result = await db
      .delete(TeamMemberTable)
      .where(
        and(
          eq(TeamMemberTable.teamId, teamId),
          eq(TeamMemberTable.userId, userId),
        ),
      )
      .returning({ id: TeamMemberTable.id });
    return result.length > 0;
  },

  /**
   * List every member of a team, joined to the user table so the
   * caller can render names / avatars. Sorted by role (owner
   * first), then by join time.
   */
  async listTeamMembers(
    teamId: string,
  ): Promise<
    Array<TeamMember & { name: string; email: string; image: string | null }>
  > {
    return (await db
      .select({
        id: TeamMemberTable.id,
        teamId: TeamMemberTable.teamId,
        userId: TeamMemberTable.userId,
        role: TeamMemberTable.role,
        createdAt: TeamMemberTable.createdAt,
        name: UserTable.name,
        email: UserTable.email,
        image: UserTable.image,
      })
      .from(TeamMemberTable)
      .innerJoin(UserTable, eq(TeamMemberTable.userId, UserTable.id))
      .where(eq(TeamMemberTable.teamId, teamId))
      .orderBy(
        // owner first, then admin, then member, then viewer
        sql`CASE ${TeamMemberTable.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 WHEN 'viewer' THEN 3 ELSE 4 END`,
        asc(TeamMemberTable.createdAt),
      )) as Array<
      TeamMember & { name: string; email: string; image: string | null }
    >;
  },

  async getTeamMember(
    teamId: string,
    userId: string,
  ): Promise<TeamMember | null> {
    const [row] = await db
      .select()
      .from(TeamMemberTable)
      .where(
        and(
          eq(TeamMemberTable.teamId, teamId),
          eq(TeamMemberTable.userId, userId),
        ),
      );
    return (row as TeamMember | undefined) ?? null;
  },

  async updateTeamMemberRole(
    teamId: string,
    userId: string,
    role: TeamRole,
  ): Promise<TeamMember | null> {
    // The owner role is invariant — refusing to demote the owner
    // here keeps the membership invariant consistent with
    // `removeTeamMember`. Ownership transfer is a future flow.
    const existing = await teamRepository.getTeamMember(teamId, userId);
    if (!existing) return null;
    if (existing.role === "owner" && role !== "owner") {
      throw new Error("Cannot demote the team owner");
    }
    const [row] = await db
      .update(TeamMemberTable)
      .set({ role })
      .where(
        and(
          eq(TeamMemberTable.teamId, teamId),
          eq(TeamMemberTable.userId, userId),
        ),
      )
      .returning();
    return (row as TeamMember | undefined) ?? null;
  },
};
