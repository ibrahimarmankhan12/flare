import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalEnv = { ...process.env };

describe("Upgrade token", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-key-with-enough-entropy";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("verifies a freshly minted token for the matching user and nonce", async () => {
    const { createUpgradeToken, verifyUpgradeToken } = await import(
      "./upgrade-token"
    );
    const token = createUpgradeToken({ userId: "user_1", nonce: "nonce_1" });
    expect(token).toBeTruthy();
    const result = verifyUpgradeToken({
      token,
      expectedUserId: "user_1",
      expectedNonce: "nonce_1",
    });
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.payload?.userId).toBe("user_1");
    expect(result.payload?.nonce).toBe("nonce_1");
  });

  it("rejects a token issued for a different user", async () => {
    const { createUpgradeToken, verifyUpgradeToken } = await import(
      "./upgrade-token"
    );
    const token = createUpgradeToken({ userId: "user_1", nonce: "n" });
    const result = verifyUpgradeToken({
      token,
      expectedUserId: "user_2",
      expectedNonce: "n",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("mismatch");
  });

  it("rejects a token whose nonce was tampered with in the URL", async () => {
    const { createUpgradeToken, verifyUpgradeToken } = await import(
      "./upgrade-token"
    );
    const token = createUpgradeToken({ userId: "user_1", nonce: "n1" });
    // Simulate the attacker changing ?session=... in the URL.
    const result = verifyUpgradeToken({
      token,
      expectedUserId: "user_1",
      expectedNonce: "n2",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("mismatch");
  });

  it("rejects a token with a tampered signature", async () => {
    const { createUpgradeToken, verifyUpgradeToken } = await import(
      "./upgrade-token"
    );
    const token = createUpgradeToken({ userId: "user_1", nonce: "n" });
    expect(token).toBeTruthy();
    // Flip the last char of the signature.
    const tampered = token!.slice(0, -1) + (token!.endsWith("a") ? "b" : "a");
    const result = verifyUpgradeToken({
      token: tampered,
      expectedUserId: "user_1",
      expectedNonce: "n",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("bad-signature");
  });

  it("rejects a malformed token", async () => {
    const { verifyUpgradeToken } = await import("./upgrade-token");
    for (const bad of ["", null, "no-dot", ".", "a.", "x.y.z"]) {
      const result = verifyUpgradeToken({
        token: bad,
        expectedUserId: "u",
        expectedNonce: "n",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("malformed");
    }
  });

  it("rejects an expired token", async () => {
    const { createUpgradeToken, verifyUpgradeToken } = await import(
      "./upgrade-token"
    );
    const token = createUpgradeToken({
      userId: "user_1",
      nonce: "n",
      ttlMs: -1000,
    });
    expect(token).toBeTruthy();
    const result = verifyUpgradeToken({
      token,
      expectedUserId: "user_1",
      expectedNonce: "n",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejects everything when BETTER_AUTH_SECRET is unset", async () => {
    const { createUpgradeToken } = await import("./upgrade-token");
    process.env.BETTER_AUTH_SECRET = "secret-A";
    const token = createUpgradeToken({ userId: "u", nonce: "n" });
    expect(token).toBeTruthy();

    // Now drop the secret and try to verify — the payload decodes
    // fine, so the verifier reaches the `missing-secret` branch.
    delete process.env.BETTER_AUTH_SECRET;
    const { verifyUpgradeToken } = await import("./upgrade-token");
    const result = verifyUpgradeToken({
      token,
      expectedUserId: "u",
      expectedNonce: "n",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing-secret");
  });

  it("returns null token when secret is missing at creation", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    const { createUpgradeToken } = await import("./upgrade-token");
    expect(
      createUpgradeToken({ userId: "u", nonce: "n" }),
    ).toBeNull();
  });

  it("does not verify a token signed with a different secret", async () => {
    const { createUpgradeToken, verifyUpgradeToken } = await import(
      "./upgrade-token"
    );
    process.env.BETTER_AUTH_SECRET = "secret-A";
    const token = createUpgradeToken({ userId: "u", nonce: "n" });
    process.env.BETTER_AUTH_SECRET = "secret-B";
    const result = verifyUpgradeToken({
      token,
      expectedUserId: "u",
      expectedNonce: "n",
    });
    expect(result.valid).toBe(false);
    // The signature length is the same in both cases (base64url of
    // a sha256), so this fails on content rather than on length —
    // expect bad-signature rather than malformed.
    expect(["bad-signature", "mismatch"]).toContain(result.reason);
  });
});
