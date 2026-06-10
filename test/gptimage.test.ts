import { describe, expect, it } from "vitest";
import { createBackend } from "../src/backends/index.js";
import { decodeImagesResponse, gptImageSize } from "../src/backends/gptimage.js";
import { loadConfig } from "../src/config.js";

describe("gptImageSize", () => {
  it("maps aspects to the nearest supported size by log-ratio", () => {
    expect(gptImageSize("1:1")).toBe("1024x1024");
    expect(gptImageSize("4:5")).toBe("1024x1536");
    expect(gptImageSize("9:16")).toBe("1024x1536");
    expect(gptImageSize("16:9")).toBe("1536x1024");
    expect(gptImageSize("5:4")).toBe("1536x1024");
    expect(gptImageSize("21:9")).toBe("1536x1024");
  });
});

describe("decodeImagesResponse", () => {
  it("decodes the first b64 image", () => {
    const buffer = decodeImagesResponse({ data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] }, "test");
    expect(buffer.toString()).toBe("png-bytes");
  });

  it("throws a contextual error on empty responses", () => {
    expect(() => decodeImagesResponse({ data: [] }, "OpenAI Images API")).toThrow(/OpenAI Images API/);
    expect(() => decodeImagesResponse({}, "x")).toThrow(/no image data/);
  });
});

describe("createBackend registry", () => {
  it("resolves both backends by id", () => {
    const config = loadConfig();
    expect(createBackend({ ...config, backend: "replicate" }).id).toBe("replicate");
    expect(createBackend({ ...config, backend: "gpt-image" }).id).toBe("gpt-image");
  });

  it("rejects unknown backends with the available list", () => {
    const config = loadConfig();
    expect(() => createBackend({ ...config, backend: "dall-e" })).toThrow(/replicate, gpt-image/);
  });
});
