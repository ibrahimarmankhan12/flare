import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P4.A — org-hooks tests
// ---------------------------------------------------------------------------
// We mock the teamRepository so the hook can be exercised without a
// live database, and we mock `server-only` to allow the import in the
// vitest Node environment.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const createTeamMock = vi.fn();
const addTeamMemberMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  teamRepository: {
    createTeam: (...args: unknown[]) => createTeamMock(...args),
    addTeamMember: (...args: unknown[]) => addTeamMemberMock(...args),
  },
}));

const loggerMock = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};
vi.mock("logger", () => ({
  default: loggerMock,
}));

const orgHooks = await import("./org-hooks");

describe("auth/org-hooks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("onUserCreateCreatePersonalTeam", () => {
    it("creates a team named after the user and adds them as owner", async () => {
      createTeamMock.mockResolvedValueOnce({ id: "team-1" });
      addTeamMemberMock.mockResolvedValueOnce({
        id: "tm-1",
        teamId: "team-1",
        userId: "u1",
        role: "owner",
      });

      const result = await orgHooks.onUserCreateCreatePersonalTeam({
        id: "u1",
        name: "Alice",
      });

      expect(result).toEqual({ teamId: "team-1" });
      expect(createTeamMock).toHaveBeenCalledTimes(1);
      const [teamInput, ownerId] = createTeamMock.mock.calls[0]!;
      expect(ownerId).toBe("u1");
      expect(teamInput).toMatchObject({
        name: "Alice's workspace",
        slug: "u1-personal",
      });
      expect(addTeamMemberMock).toHaveBeenCalledWith("team-1", "u1", "owner");
    });

    it("uses a default name when user.name is missing", async () => {
      createTeamMock.mockResolvedValueOnce({ id: "team-2" });
      addTeamMemberMock.mockResolvedValueOnce({
        id: "tm-2",
        teamId: "team-2",
        userId: "u2",
        role: "owner",
      });

      const result = await orgHooks.onUserCreateCreatePersonalTeam({
        id: "u2",
        name: null,
      });

      expect(result).toEqual({ teamId: "team-2" });
      const [teamInput] = createTeamMock.mock.calls[0]!;
      expect(teamInput.name).toBe("User's workspace");
      expect(teamInput.slug).toBe("u2-personal");
    });

    it("uses a default name when user.name is empty whitespace", async () => {
      createTeamMock.mockResolvedValueOnce({ id: "team-3" });
      addTeamMemberMock.mockResolvedValueOnce({
        id: "tm-3",
        teamId: "team-3",
        userId: "u3",
        role: "owner",
      });

      await orgHooks.onUserCreateCreatePersonalTeam({
        id: "u3",
        name: "   ",
      });

      const [teamInput] = createTeamMock.mock.calls[0]!;
      expect(teamInput.name).toBe("User's workspace");
    });

    it("returns null and logs the error when createTeam throws", async () => {
      createTeamMock.mockRejectedValueOnce(new Error("db down"));

      const result = await orgHooks.onUserCreateCreatePersonalTeam({
        id: "u4",
        name: "Bob",
      });

      expect(result).toBeNull();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it("returns null when the user object is empty (defensive)", async () => {
      const result = await orgHooks.onUserCreateCreatePersonalTeam(
        {} as { id: string; name?: string | null },
      );
      expect(result).toBeNull();
      expect(createTeamMock).not.toHaveBeenCalled();
    });

    it("treats a missing name the same as null (defensive)", async () => {
      createTeamMock.mockResolvedValueOnce({ id: "team-5" });
      addTeamMemberMock.mockResolvedValueOnce({
        id: "tm-5",
        teamId: "team-5",
        userId: "u5",
        role: "owner",
      });

      const result = await orgHooks.onUserCreateCreatePersonalTeam({
        id: "u5",
      });

      expect(result).toEqual({ teamId: "team-5" });
      const [teamInput] = createTeamMock.mock.calls[0]!;
      expect(teamInput.name).toBe("User's workspace");
      expect(teamInput.slug).toBe("u5-personal");
    });
  });

  describe("registerOrganizationHooks", () => {
    it("is idempotent — calling it twice does not throw", async () => {
      await expect(
        orgHooks.registerOrganizationHooks(),
      ).resolves.toBeUndefined();
      await expect(
        orgHooks.registerOrganizationHooks(),
      ).resolves.toBeUndefined();
    });
  });
});
