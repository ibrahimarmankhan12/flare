import { beforeAll, describe, expect, it, vi } from "vitest";
import { GEMINI_FILE_MIME_TYPES } from "./file-support";

vi.mock("server-only", () => ({}));

let modelsModule: typeof import("./models");

beforeAll(async () => {
  modelsModule = await import("./models");
});

describe("customModelProvider file support metadata", () => {
  it("includes default file support for Google Gemini 3 Flash", () => {
    const modelName = "Gemini 3 Flash";
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "google",
      model: modelName,
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );

    const googleProvider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "google",
    );
    const metadata = googleProvider?.models.find(
      (item) => item.name === modelName,
    );

    expect(metadata?.supportedFileMimeTypes).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );
  });

  it("does not advertise native image file support for GLM 4.7", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "zAI",
      model: "GLM 4.7",
    });

    expect(getFilePartSupportedMimeTypes(model)).toEqual([]);

    const provider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "zAI",
    );
    const metadata = provider?.models.find((item) => item.name === "GLM 4.7");

    expect(metadata?.supportedFileMimeTypes).toEqual([]);
    expect(metadata?.isImageInputUnsupported).toBe(true);
  });

  it("does not advertise native image file support for GLM 5.1", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "zAI",
      model: "GLM 5.1",
    });

    expect(getFilePartSupportedMimeTypes(model)).toEqual([]);

    const provider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "zAI",
    );
    const metadata = provider?.models.find((item) => item.name === "GLM 5.1");

    expect(metadata?.supportedFileMimeTypes).toEqual([]);
    expect(metadata?.isImageInputUnsupported).toBe(true);
  });

  it("wraps stale canvas model fallback without an undefined fallback provider crash", () => {
    const { customModelProvider } = modelsModule;

    expect(() =>
      customModelProvider.getModelWithFailureFallback({
        provider: "openai",
        model: "GPT 5.2",
      }),
    ).not.toThrow();
  });
});
