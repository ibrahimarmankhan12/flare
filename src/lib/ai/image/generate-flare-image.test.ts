import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImageWithFlare } from "./generate-flare-image";

vi.mock("logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("generateImageWithFlare", () => {
  const previousApiKey = process.env.FLARE_API_KEY;

  beforeEach(() => {
    process.env.FLARE_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.FLARE_API_KEY = previousApiKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("generates an image and returns inline base64", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        created: 1771591280,
        model: "pixai",
        data: [{ b64_json: "aW1hZ2VkYXRh" }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImageWithFlare({
      prompt: "A beautiful sunset over mountains",
      model: "nbpro",
    });

    expect(result.model).toBe("nbpro");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].base64).toBe("aW1hZ2VkYXRh");
    expect(result.images[0].mimeType).toBe("image/png");

    const [firstCall] = fetchMock.mock.calls;
    const [url, init] = firstCall as [string, RequestInit];
    expect(url).toBe("https://api.flare-sh.tech/v1/images/generations");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-api-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("Flare Image/nbpro");
    expect(body.response_format).toBe("b64_json");
  }, 20000);

  it("throws when the API returns no images", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ created: 0, data: [] }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateImageWithFlare({ prompt: "nothing here" }),
    ).rejects.toThrow("No images were generated");
  }, 20000);

  it("throws when FLARE_API_KEY is not configured", async () => {
    delete process.env.FLARE_API_KEY;

    await expect(
      generateImageWithFlare({ prompt: "test" }),
    ).rejects.toThrow("FLARE_API_KEY is not configured");
  }, 20000);
});
