import { PNG } from "pngjs";
import { normalizeHex } from "./contract.js";
import type { AspectCheck, DeterministicChecks, PaletteCheck, PaletteColor, ToneCheck } from "./types.js";

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) => Math.round(v).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** sRGB → CIELAB (D65). Standard reference implementation. */
export function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  // sRGB D65 reference white
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 color difference. ~2.3 is a just-noticeable difference. */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function samplePixels(png: PNG, maxSamples = 12000): Rgb[] {
  const total = png.width * png.height;
  const stride = Math.max(1, Math.floor(total / maxSamples));
  const out: Rgb[] = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if (png.data[o + 3]! < 128) continue; // skip transparent pixels
    out.push([png.data[o]!, png.data[o + 1]!, png.data[o + 2]!]);
  }
  return out;
}

/**
 * Dominant colors via k-means seeded from a coarse histogram. Good enough
 * to measure palette drift; not a perceptual quantizer.
 */
export function extractPalette(png: PNG, k = 6): { rgb: Rgb; weight: number }[] {
  const pixels = samplePixels(png);
  if (pixels.length === 0) return [];

  // Seed centroids from the most-populated 4-bit-per-channel histogram bins.
  const bins = new Map<number, { sum: [number, number, number]; count: number }>();
  for (const [r, g, b] of pixels) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) ?? { sum: [0, 0, 0], count: 0 };
    bin.sum[0] += r;
    bin.sum[1] += g;
    bin.sum[2] += b;
    bin.count += 1;
    bins.set(key, bin);
  }
  let centroids: Rgb[] = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, k)
    .map((bin) => [bin.sum[0] / bin.count, bin.sum[1] / bin.count, bin.sum[2] / bin.count]);

  const dist2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  let assignment = new Array<number>(pixels.length).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    assignment = pixels.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = dist2(p, c);
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      return best;
    });
    const sums = centroids.map(() => ({ sum: [0, 0, 0] as [number, number, number], count: 0 }));
    pixels.forEach((p, pi) => {
      const s = sums[assignment[pi]!]!;
      s.sum[0] += p[0];
      s.sum[1] += p[1];
      s.sum[2] += p[2];
      s.count += 1;
    });
    centroids = sums.map((s, si) =>
      s.count === 0 ? centroids[si]! : [s.sum[0] / s.count, s.sum[1] / s.count, s.sum[2] / s.count],
    );
  }

  const counts = centroids.map(() => 0);
  assignment.forEach((ci) => {
    counts[ci] = (counts[ci] ?? 0) + 1;
  });
  return centroids
    .map((rgb, i) => ({ rgb, weight: counts[i]! / pixels.length }))
    .filter((c) => c.weight > 0.02)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Weighted palette adherence: each dominant image color is scored by its
 * Lab distance to the nearest contract color. deltaE 0 → 100, deltaE >= 40 → 0.
 */
export function paletteAdherence(png: PNG, contractPalette: PaletteColor[]): PaletteCheck {
  const contractRgb = contractPalette.map((c) => ({ hex: c.hex, rgb: hexToRgb(c.hex) }));
  const dominant = extractPalette(png).map(({ rgb, weight }) => {
    let nearest = contractRgb[0]!;
    let best = Infinity;
    for (const c of contractRgb) {
      const d = deltaE(rgb, c.rgb);
      if (d < best) {
        best = d;
        nearest = c;
      }
    }
    return { hex: rgbToHex(rgb), weight, nearestContractHex: nearest.hex, deltaE: Math.round(best * 10) / 10 };
  });

  const totalWeight = dominant.reduce((s, d) => s + d.weight, 0) || 1;
  const weightedDelta = dominant.reduce((s, d) => s + d.deltaE * d.weight, 0) / totalWeight;
  const adherence = Math.round(Math.max(0, Math.min(100, 100 - (weightedDelta / 40) * 100)));
  return { adherence, dominant };
}

/**
 * Tonal key and contrast from the luminance distribution. No contract
 * target — these are measured facts handed to the critique as context.
 */
export function toneStats(png: PNG): ToneCheck {
  const lumas = samplePixels(png)
    .map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b)
    .sort((a, b) => a - b);
  if (lumas.length === 0) {
    return { meanLuma: 0, p5: 0, p95: 0, key: "mid", contrast: "flat" };
  }
  const pick = (q: number) => lumas[Math.min(lumas.length - 1, Math.floor(q * lumas.length))]!;
  const mean = lumas.reduce((s, l) => s + l, 0) / lumas.length;
  const p5 = pick(0.05);
  const p95 = pick(0.95);
  const spread = p95 - p5;
  return {
    meanLuma: Math.round(mean),
    p5: Math.round(p5),
    p95: Math.round(p95),
    key: mean < 85 ? "low" : mean > 170 ? "high" : "mid",
    contrast: spread < 80 ? "flat" : spread > 170 ? "punchy" : "moderate",
  };
}

export function checkAspect(width: number, height: number, expected: string, tolerance = 0.03): AspectCheck {
  const [w, h] = expected.split(":").map(Number) as [number, number];
  const ok = Math.abs(width / height - w / h) / (w / h) <= tolerance;
  return { ok, actual: `${width}x${height}`, expected };
}

export function runChecks(pngBuffer: Buffer, contract: { palette: PaletteColor[]; aspect: string }): DeterministicChecks {
  const png = PNG.sync.read(pngBuffer);
  return {
    palette: paletteAdherence(png, contract.palette),
    aspect: checkAspect(png.width, png.height, contract.aspect),
    tone: toneStats(png),
  };
}
