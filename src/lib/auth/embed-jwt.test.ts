import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmbedJwtError, mintEmbedToken, verifyEmbedToken } from "./embed-jwt";

const now = new Date("2026-06-01T12:00:00Z");

const mintInput = {
  agentId: "agent-1",
  sessionId: "session-1",
  anonymousToken: "anon-1",
  now,
};

describe("embed JWT", () => {
  beforeEach(() => {
    process.env.EMBED_JWT_SECRET = "test-secret";
  });

  it("mints and verifies an embed token", () => {
    const token = mintEmbedToken(mintInput);
    const payload = verifyEmbedToken(token, { now });

    expect(payload).toMatchObject({
      agentId: "agent-1",
      sessionId: "session-1",
      anonymousToken: "anon-1",
      iat: 1_780_315_200,
      exp: 1_780_316_100,
    });
    expect(payload.jti).toHaveLength(32);
  });

  it("uses a short default lifetime", () => {
    const token = mintEmbedToken(mintInput);
    const payload = verifyEmbedToken(token, { now });

    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("honors a custom ttl", () => {
    const token = mintEmbedToken({ ...mintInput, ttlSeconds: 60 });
    const payload = verifyEmbedToken(token, { now });

    expect(payload.exp - payload.iat).toBe(60);
  });

  it("caps ttl at one hour", () => {
    const token = mintEmbedToken({ ...mintInput, ttlSeconds: 99_999 });
    const payload = verifyEmbedToken(token, { now });

    expect(payload.exp - payload.iat).toBe(60 * 60);
  });

  it("rejects a tampered payload", () => {
    const token = mintEmbedToken(mintInput);
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    decoded.agentId = "agent-2";
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString(
      "base64url",
    );

    expect(() =>
      verifyEmbedToken(`${header}.${tamperedPayload}.${signature}`, { now }),
    ).toThrow(/signature/i);
  });

  it("rejects malformed tokens", () => {
    expect(() => verifyEmbedToken("not-a-jwt", { now })).toThrow(EmbedJwtError);
  });

  it("rejects expired tokens", () => {
    const token = mintEmbedToken({ ...mintInput, ttlSeconds: 1 });

    expect(() =>
      verifyEmbedToken(token, { now: new Date(now.getTime() + 2_000) }),
    ).toThrow(/expired/i);
  });

  it("requires EMBED_JWT_SECRET", () => {
    delete process.env.EMBED_JWT_SECRET;

    expect(() => mintEmbedToken(mintInput)).toThrow(/EMBED_JWT_SECRET/);
  });
});
