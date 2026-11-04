import { expect, test } from "@playwright/test";

test.describe("API key external surface", () => {
  test("API key management endpoints require a signed-in user", async ({
    request,
  }) => {
    const list = await request.get("/api/api-key");
    expect(list.status()).toBe(401);

    const create = await request.post("/api/api-key", {
      data: { name: "e2e key", scopes: ["threads:read"] },
    });
    expect(create.status()).toBe(401);
  });

  test("rotation and usage endpoints require a signed-in user", async ({
    request,
  }) => {
    const rotate = await request.post("/api/api-key/e2e-key-id/rotate", {
      data: { graceHours: 24 },
    });
    expect(rotate.status()).toBe(401);

    const usage = await request.get("/api/api-key/e2e-key-id/usage?days=30");
    expect(usage.status()).toBe(401);
  });

  test("public REST routes require bearer API keys", async ({ request }) => {
    const response = await request.get("/api/v1/threads");
    expect(response.status()).toBe(401);
  });
});
