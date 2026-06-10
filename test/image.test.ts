import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { cropToAspect, downscalePng, pngDataUri } from "../src/image.js";

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

describe("cropToAspect", () => {
  function splitPngBuffer(left: [number, number, number], right: [number, number, number], width: number, height: number): Buffer {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rgb = x < width / 2 ? left : right;
        const o = (y * width + x) * 4;
        png.data[o] = rgb[0];
        png.data[o + 1] = rgb[1];
        png.data[o + 2] = rgb[2];
        png.data[o + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }

  it("center-crops a wide image to a square", () => {
    const out = PNG.sync.read(cropToAspect(splitPngBuffer([255, 0, 0], [0, 0, 255], 200, 100), "1:1"));
    expect(out.width).toBe(100);
    expect(out.height).toBe(100);
    // Crop spans x=50..149 of the original: left half red, right half blue.
    expect(out.data[0]).toBe(255);
    expect(out.data[(out.width - 1) * 4 + 2]).toBe(255);
  });

  it("crops height for images taller than the target", () => {
    const out = PNG.sync.read(cropToAspect(splitPngBuffer([1, 2, 3], [1, 2, 3], 100, 200), "1:1"));
    expect(out.width).toBe(100);
    expect(out.height).toBe(100);
  });

  it("returns the original buffer when the aspect already matches", () => {
    const original = splitPngBuffer([1, 2, 3], [4, 5, 6], 160, 200);
    expect(cropToAspect(original, "4:5")).toBe(original);
  });
});

describe("pngDataUri", () => {
  it("emits a base64 png data URI", () => {
    const uri = pngDataUri(solidPngBuffer([1, 2, 3], 4, 4));
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(uri.split(",")[1]!, "base64").subarray(1, 4).toString()).toBe("PNG");
  });
});
