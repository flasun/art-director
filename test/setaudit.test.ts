import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { computeSetDrift, paletteSetDistance, renderDriftSummary } from "../src/setaudit.js";

function solidPngBuffer(rgb: [number, number, number], size = 48): Buffer {
  const png = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("paletteSetDistance", () => {
  const warm = [
    { rgb: [232, 220, 200] as [number, number, number], weight: 0.7 },
    { rgb: [122, 74, 43] as [number, number, number], weight: 0.3 },
  ];

  it("is zero for identical palettes", () => {
    expect(paletteSetDistance(warm, warm)).toBe(0);
  });

  it("is large for unrelated palettes", () => {
    const cold = [{ rgb: [40, 60, 220] as [number, number, number], weight: 1 }];
    expect(paletteSetDistance(warm, cold)).toBeGreaterThan(25);
  });

  it("handles empty palettes without exploding", () => {
    expect(paletteSetDistance([], warm)).toBe(0);
  });
});

describe("computeSetDrift", () => {
  it("flags the one cold image in a warm set", () => {
    const drift = computeSetDrift([
      { id: "warm-1", png: solidPngBuffer([230, 215, 195]) },
      { id: "warm-2", png: solidPngBuffer([225, 210, 190]) },
      { id: "warm-3", png: solidPngBuffer([235, 218, 200]) },
      { id: "cold", png: solidPngBuffer([40, 60, 220]) },
    ]);
    expect(drift.outliers.map((o) => o.id)).toEqual(["cold"]);
    expect(drift.pairs).toHaveLength(6);
    expect(drift.meanPairDistance).toBeGreaterThan(0);
  });

  it("reports no outliers for a tight set", () => {
    const drift = computeSetDrift([
      { id: "a", png: solidPngBuffer([230, 215, 195]) },
      { id: "b", png: solidPngBuffer([228, 213, 193]) },
      { id: "c", png: solidPngBuffer([232, 217, 197]) },
    ]);
    expect(drift.outliers).toEqual([]);
    expect(drift.meanPairDistance).toBeLessThan(5);
  });

  it("never flags outliers with fewer than 3 members", () => {
    const drift = computeSetDrift([
      { id: "a", png: solidPngBuffer([230, 215, 195]) },
      { id: "b", png: solidPngBuffer([40, 60, 220]) },
    ]);
    expect(drift.outliers).toEqual([]);
    expect(drift.pairs).toHaveLength(1);
  });

  it("handles a single member", () => {
    const drift = computeSetDrift([{ id: "only", png: solidPngBuffer([230, 215, 195]) }]);
    expect(drift.pairs).toEqual([]);
    expect(drift.meanPairDistance).toBe(0);
  });
});

describe("renderDriftSummary", () => {
  it("includes the mean distance and outlier reasons", () => {
    const drift = computeSetDrift([
      { id: "warm-1", png: solidPngBuffer([230, 215, 195]) },
      { id: "warm-2", png: solidPngBuffer([225, 210, 190]) },
      { id: "warm-3", png: solidPngBuffer([235, 218, 200]) },
      { id: "cold", png: solidPngBuffer([40, 60, 220]) },
    ]);
    const summary = renderDriftSummary(drift);
    expect(summary).toContain("Mean pairwise palette distance");
    expect(summary).toContain("cold");
  });
});
