import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  checkAspect,
  deltaE,
  extractPalette,
  hexToRgb,
  paletteAdherence,
  rgbToHex,
  runChecks,
} from "../src/checks.js";

function solidPng(width: number, height: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

function halfHalfPng(width: number, height: number, left: [number, number, number], right: [number, number, number]): PNG {
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
  return png;
}

describe("color math", () => {
  it("converts hex to rgb and back", () => {
    expect(hexToRgb("#E8DCC8")).toEqual([232, 220, 200]);
    expect(rgbToHex([232, 220, 200])).toBe("#E8DCC8");
  });

  it("deltaE is zero for identical colors and large for black vs white", () => {
    expect(deltaE([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(deltaE([0, 0, 0], [255, 255, 255])).toBeGreaterThan(90);
  });

  it("deltaE is small for near-identical colors", () => {
    expect(deltaE([232, 220, 200], [230, 219, 201])).toBeLessThan(2);
  });
});

describe("extractPalette", () => {
  it("finds the single color of a solid image", () => {
    const palette = extractPalette(solidPng(64, 64, [200, 50, 50]));
    expect(palette).toHaveLength(1);
    expect(palette[0]!.weight).toBeCloseTo(1, 1);
    expect(deltaE(palette[0]!.rgb.map(Math.round) as [number, number, number], [200, 50, 50])).toBeLessThan(2);
  });

  it("finds both colors of a half-and-half image with ~equal weight", () => {
    const palette = extractPalette(halfHalfPng(64, 64, [255, 0, 0], [0, 0, 255]));
    expect(palette.length).toBe(2);
    for (const entry of palette) {
      expect(entry.weight).toBeGreaterThan(0.4);
      expect(entry.weight).toBeLessThan(0.6);
    }
  });
});

describe("paletteAdherence", () => {
  const contractPalette = [
    { hex: "#C83232", role: "primary", name: "red" },
    { hex: "#0000FF", role: "accent", name: "blue" },
  ];

  it("scores ~100 when the image sits on the contract palette", () => {
    const check = paletteAdherence(solidPng(64, 64, [200, 50, 50]), contractPalette);
    expect(check.adherence).toBeGreaterThanOrEqual(95);
    expect(check.dominant[0]!.nearestContractHex).toBe("#C83232");
  });

  it("scores low when the image is far from the palette", () => {
    const check = paletteAdherence(solidPng(64, 64, [40, 200, 90]), contractPalette);
    expect(check.adherence).toBeLessThan(40);
  });
});

describe("checkAspect", () => {
  it("accepts matching ratios within tolerance", () => {
    expect(checkAspect(1024, 1280, "4:5").ok).toBe(true);
    expect(checkAspect(1020, 1280, "4:5").ok).toBe(true);
  });

  it("rejects wrong ratios", () => {
    const check = checkAspect(1024, 1024, "4:5");
    expect(check.ok).toBe(false);
    expect(check.actual).toBe("1024x1024");
  });
});

describe("runChecks", () => {
  it("runs against an encoded PNG buffer", () => {
    const buffer = PNG.sync.write(solidPng(40, 50, [232, 220, 200]));
    const checks = runChecks(buffer, {
      palette: [{ hex: "#E8DCC8", role: "background", name: "oat cream" }],
      aspect: "4:5",
    });
    expect(checks.palette.adherence).toBeGreaterThanOrEqual(95);
    expect(checks.aspect.ok).toBe(true);
  });
});
