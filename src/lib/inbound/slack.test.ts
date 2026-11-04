import { describe, expect, it } from "vitest";

import { createHmac } from "node:crypto";
import { computeSlackSignature, parseSlackEvent } from "./slack";

const SIGNING_SECRET = "shhh_super_secret_slack_signing_key";

const sign = (rawBody: string, ts: number, secret = SIGNING_SECRET) => {
  const timestamp = String(ts);
  const signature = computeSlackSignature(secret, timestamp, rawBody);
  return {
    "x-slack-signature": signature,
    "x-slack-request-timestamp": timestamp,
  };
};

const now = () => 1_700_000_000_000; // fixed: 2023-11-14T22:13:20Z

describe("parseSlackEvent", () => {
  it("accepts a correctly signed message event within the 5-minute window", () => {
    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T0001",
      event_id: "Ev1",
      event: {
        type: "message",
        text: "hi",
        user: "U001",
        channel: "C001",
      },
    });
    const result = parseSlackEvent(
      rawBody,
      sign(rawBody, Math.floor(now() / 1000)),
      SIGNING_SECRET,
      now(),
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "event") {
      expect(result.payload.teamId).toBe("T0001");
      expect(result.payload.eventId).toBe("Ev1");
      expect(result.payload.event.type).toBe("message");
    } else {
      throw new Error("expected kind=event");
    }
  });

  it("rejects a stale timestamp (> 5 minutes old)", () => {
    const rawBody = JSON.stringify({ type: "event_callback" });
    const stale = Math.floor(now() / 1000) - 60 * 60; // 1 hour ago
    const result = parseSlackEvent(
      rawBody,
      sign(rawBody, stale),
      SIGNING_SECRET,
      now(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("Stale timestamp");
    }
  });

  it("rejects a tampered body", () => {
    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T0001",
      event: { type: "message", text: "original" },
    });
    const headers = sign(rawBody, Math.floor(now() / 1000));
    const tampered = rawBody.replace("original", "tampered");
    const result = parseSlackEvent(tampered, headers, SIGNING_SECRET, now());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("Invalid signature");
    }
  });

  it("rejects when the signature header is missing", () => {
    const rawBody = "{}";
    const result = parseSlackEvent(
      rawBody,
      { "x-slack-request-timestamp": String(Math.floor(now() / 1000)) },
      SIGNING_SECRET,
      now(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it("echoes back the url_verification challenge", () => {
    const rawBody = JSON.stringify({
      type: "url_verification",
      challenge: "challenge_xyz",
    });
    const result = parseSlackEvent(
      rawBody,
      sign(rawBody, Math.floor(now() / 1000)),
      SIGNING_SECRET,
      now(),
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "challenge") {
      expect(result.challenge).toBe("challenge_xyz");
    } else {
      throw new Error("expected kind=challenge");
    }
  });

  it("rejects a request with the wrong signing secret", () => {
    const rawBody = JSON.stringify({ type: "event_callback" });
    // Sign with a different secret but provide the same headers.
    const ts = String(Math.floor(now() / 1000));
    const signature = createHmac("sha256", "WRONG_SECRET")
      .update(`v0:${ts}:${rawBody}`)
      .digest("hex");
    const result = parseSlackEvent(
      rawBody,
      {
        "x-slack-signature": `v0=${signature}`,
        "x-slack-request-timestamp": ts,
      },
      SIGNING_SECRET,
      now(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("Invalid signature");
    }
  });
});
