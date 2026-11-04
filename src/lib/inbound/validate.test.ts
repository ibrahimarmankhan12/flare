import { describe, expect, it } from "vitest";

import { validateInboundRequest } from "./validate";

// SHA-256 of "secret123" — kept in sync with the SECRET constant.
const SECRET_HASH =
  "fcf730b6d95236ecd3c9fc2d92d7b6b2bb061514961aec041d6c7a7192f592e4";
const SECRET = "secret123";

const baseInput = {
  token: "tok_abc",
  endpoint: {
    secretHash: SECRET_HASH,
    enabled: true,
  },
} as const;

describe("validateInboundRequest", () => {
  it("accepts a valid token + valid secret", () => {
    const result = validateInboundRequest({
      ...baseInput,
      providedSecret: SECRET,
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns 404 when the endpoint is missing", () => {
    const result = validateInboundRequest({
      ...baseInput,
      endpoint: null,
      providedSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe("Endpoint not found");
    }
  });

  it("returns 404 when the endpoint is disabled", () => {
    const result = validateInboundRequest({
      ...baseInput,
      endpoint: { ...baseInput.endpoint, enabled: false },
      providedSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe("Endpoint disabled");
    }
  });

  it("returns 401 on a wrong secret", () => {
    const result = validateInboundRequest({
      ...baseInput,
      providedSecret: "wrong",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("Invalid secret");
    }
  });

  it("returns 404 on an empty token", () => {
    const result = validateInboundRequest({
      ...baseInput,
      token: "",
      providedSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 401 when the secret length differs (constant-time path)", () => {
    const result = validateInboundRequest({
      ...baseInput,
      providedSecret: "x", // very short secret
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it("fails closed when the endpoint has no secret configured", () => {
    const result = validateInboundRequest({
      ...baseInput,
      endpoint: { secretHash: null, enabled: true },
      providedSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it("returns 401 when secret is required but missing", () => {
    const result = validateInboundRequest({
      ...baseInput,
      providedSecret: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });
});
