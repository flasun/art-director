import { PNG } from "pngjs";
import { deltaE, extractPalette, toneStats } from "./checks.js";

export interface SetMember {
  id: string;
  png: Buffer;
}

export interface SetDriftReport {
  pairs: { a: string; b: string; paletteDistance: number }[];
  members: { id: string; meanLuma: number; lumaDeviation: number; meanDistanceToOthers: number }[];
  outliers: { id: string; reason: string }[];
  meanPairDistance: number;
}

type WeightedPalette = { rgb: [number, number, number]; weight: number }[];

/**
 * Symmetric weighted nearest-neighbor distance between two dominant
 * palettes, in deltaE units. 0 = same palette; ~10 reads as "same family";
 * 25+ is visibly a different palette.
 */
export function paletteSetDistance(a: WeightedPalette, b: WeightedPalette): number {
  if (a.length === 0 || b.length === 0) return 0;
  const directed = (from: WeightedPalette, to: WeightedPalette) => {
    let total = 0;
    let weight = 0;
    for (const color of from) {
      const nearest = Math.min(...to.map((t) => deltaE(color.rgb, t.rgb)));
      total += nearest * color.weight;
      weight += color.weight;
    }
    return weight === 0 ? 0 : total / weight;
  };
  return Math.round(((directed(a, b) + directed(b, a)) / 2) * 10) / 10;
}

const LUMA_DEVIATION_LIMIT = 45;
const ABSOLUTE_DISTANCE_FLOOR = 12;

/**
 * Cross-set drift: pairwise palette distances plus per-member luminance
 * deviation from the set mean. An outlier is a member whose palette sits
 * far from everyone else's, or whose tonal key leaves the set.
 */
export function computeSetDrift(members: SetMember[]): SetDriftReport {
  const analyzed = members.map(({ id, png }) => {
    const decoded = PNG.sync.read(png);
    return { id, palette: extractPalette(decoded), tone: toneStats(decoded) };
  });

  const pairs: SetDriftReport["pairs"] = [];
  for (let i = 0; i < analyzed.length; i++) {
    for (let j = i + 1; j < analyzed.length; j++) {
      pairs.push({
        a: analyzed[i]!.id,
        b: analyzed[j]!.id,
        paletteDistance: paletteSetDistance(analyzed[i]!.palette, analyzed[j]!.palette),
      });
    }
  }
  const meanPairDistance =
    pairs.length === 0 ? 0 : Math.round((pairs.reduce((s, p) => s + p.paletteDistance, 0) / pairs.length) * 10) / 10;

  const meanLumaOfSet = analyzed.reduce((s, m) => s + m.tone.meanLuma, 0) / Math.max(1, analyzed.length);
  const memberStats = analyzed.map((member) => {
    const others = pairs.filter((p) => p.a === member.id || p.b === member.id);
    const meanDistanceToOthers =
      others.length === 0
        ? 0
        : Math.round((others.reduce((s, p) => s + p.paletteDistance, 0) / others.length) * 10) / 10;
    return {
      id: member.id,
      meanLuma: member.tone.meanLuma,
      lumaDeviation: Math.round(Math.abs(member.tone.meanLuma - meanLumaOfSet)),
      meanDistanceToOthers,
    };
  });

  const outliers: SetDriftReport["outliers"] = [];
  if (analyzed.length >= 3) {
    for (const member of memberStats) {
      if (
        member.meanDistanceToOthers > Math.max(ABSOLUTE_DISTANCE_FLOOR, 1.5 * meanPairDistance)
      ) {
        outliers.push({
          id: member.id,
          reason: `palette sits ΔE ${member.meanDistanceToOthers} from the rest of the set (set mean ${meanPairDistance})`,
        });
      } else if (member.lumaDeviation > LUMA_DEVIATION_LIMIT) {
        outliers.push({
          id: member.id,
          reason: `tonal key deviates by ${member.lumaDeviation} luma from the set mean`,
        });
      }
    }
  }

  return { pairs, members: memberStats, outliers, meanPairDistance };
}

export function renderDriftSummary(drift: SetDriftReport): string {
  const worst = [...drift.pairs].sort((a, b) => b.paletteDistance - a.paletteDistance).slice(0, 5);
  return [
    `Mean pairwise palette distance: ΔE ${drift.meanPairDistance}`,
    worst.length ? `Farthest pairs: ${worst.map((p) => `${p.a}↔${p.b} (ΔE ${p.paletteDistance})`).join(", ")}` : "",
    drift.outliers.length
      ? `Measured outliers: ${drift.outliers.map((o) => `${o.id} — ${o.reason}`).join("; ")}`
      : "Measured outliers: none",
  ]
    .filter(Boolean)
    .join("\n");
}
