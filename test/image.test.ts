import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { downscalePng, pngDataUri } from "../src/image.js";

function solidPngBuffer(rgb: [number, number, number], width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("downscalePng", () => {
  it("scales the long edge down to maxEdge and keeps the ratio", () => {
    const out = PNG.sync.read(downscalePng(solidPngBuffer([200, 50, 50], 1600, 800), 400));
    expect(out.width).toBe(400);
    expect(out.height).toBe(200);
  });

  it("preserves pixel content", () => {
    const out = PNG.sync.read(downscalePng(solidPngBuffer([200, 50, 50], 1000, 1000), 100));
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([200, 50, 50]);
  });

  it("never upscales", () => {
    const original = solidPngBuffer([10, 20, 30], 100, 50);
    expect(downscalePng(original, 768)).toBe(original);
  });
});

describe("pngDataUri", () => {
  it("emits a base64 png data URI", () => {
    const uri = pngDataUri(solidPngBuffer([1, 2, 3], 4, 4));
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(uri.split(",")[1]!, "base64").subarray(1, 4).toString()).toBe("PNG");
  });
});
