import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editImageWithFlare } from "./edit-image";

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

function imageResponse(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
    },
  });
}

describe("editImageWithFlare", () => {
  const previousApiKey = process.env.FLARE_API_KEY;

  beforeEach(() => {
    process.env.FLARE_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.FLARE_API_KEY = previousApiKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("edits an image and converts the returned URL to base64", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          created: 1771591280,
          data: [
            {
              url: "https://api.flare-sh.tech/generated_images/edited.png",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(imageResponse([9, 8, 7, 6]));

    vi.stubGlobal("fetch", fetchMock);

    const result = await editImageWithFlare({
      imageBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
      imageMimeType: "image/png",
      prompt: "Add a hat",
      model: "nbpro",
    });

    expect(result.model).toBe("nbpro");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[0].base64).toBe(
      Buffer.from([9, 8, 7, 6]).toString("base64"),
    );

    const [firstCall] = fetchMock.mock.calls;
    const [url, init] = firstCall as [string, RequestInit];
    expect(url).toBe("https://api.flare-sh.tech/v1/images/edits");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-api-key");
  }, 20000);

  it("uses inline b64_json when present", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        created: 1771591280,
        data: [{ b64_json: "aW1hZ2VkYXRh" }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await editImageWithFlare({
      imageBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
      imageMimeType: "image/png",
      prompt: "Make it blue",
      model: "nano-banana",
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].base64).toBe("aW1hZ2VkYXRh");
  }, 20000);

  it("throws when the API returns no images", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ created: 0, data: [] }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      editImageWithFlare({
        imageBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
        imageMimeType: "image/png",
        prompt: "Make it red",
      }),
    ).rejects.toThrow("No edited images were returned");
  }, 20000);

  it("throws when FLARE_API_KEY is not configured", async () => {
    delete process.env.FLARE_API_KEY;

    await expect(
      editImageWithFlare({
        imageBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
        imageMimeType: "image/png",
        prompt: "Make it green",
      }),
    ).rejects.toThrow("FLARE_API_KEY is not configured");
  }, 20000);
});
