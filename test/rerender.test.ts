import { describe, expect, it } from "vitest";
import { renderRerenderReport } from "../src/rerender.js";
import type { DeterministicChecks } from "../src/types.js";

const CHECKS: DeterministicChecks = {
  palette: { adherence: 88, dominant: [] },
  aspect: { ok: true, actual: "1024x1280", expected: "4:5" },
  tone: { meanLuma: 180, p5: 90, p95: 240, key: "high", contrast: "moderate" },
};

describe("renderRerenderReport", () => {
  it("records verdict, models, measured values, prompt, and spend", () => {
    const md = renderRerenderReport({
      shotDescription: "hero: pour-over at dawn",
      backendId: "gpt-image",
      rerenderModelId: "gpt-image-1",
      originalModelId: "black-forest-labs/flux-1.1-pro",
      contractVersion: 3,
      prompt: "A serene kitchen scene...",
      comparison: {
        verdict: "rerender",
        differences: ["Re-render holds the oat-cream ground; original drifts warm"],
        advice: "Ship the re-render.",
      },
      originalChecks: { ...CHECKS, palette: { adherence: 71, dominant: [] } },
      rerenderChecks: CHECKS,
      paletteDistance: 14.3,
      usage: { claudeCalls: 2, inputTokens: 9000, outputTokens: 900, draftRenders: 0, finalRenders: 1 },
    });
    expect(md).toContain("## Verdict: rerender");
    expect(md).toContain("black-forest-labs/flux-1.1-pro");
    expect(md).toContain("gpt-image-1");
    expect(md).toContain("Judged against direction.md v3.");
    expect(md).toContain("Original: palette 71/100");
    expect(md).toContain("Re-render: palette 88/100");
    expect(md).toContain("ΔE 14.3");
    expect(md).toContain("A serene kitchen scene...");
    expect(md).toContain("0 draft + 1 final renders");
  });

  it("labels an unknown original model honestly", () => {
    const md = renderRerenderReport({
      shotDescription: "x",
      backendId: "replicate",
      rerenderModelId: "black-forest-labs/flux-1.1-pro",
      originalModelId: null,
      contractVersion: 1,
      prompt: "p",
      comparison: { verdict: "tie", differences: [], advice: "" },
      originalChecks: CHECKS,
      rerenderChecks: CHECKS,
      paletteDistance: 0,
      usage: { claudeCalls: 2, inputTokens: 1, outputTokens: 1, draftRenders: 0, finalRenders: 1 },
    });
    expect(md).toContain("unknown model");
    expect(md).toContain("## Verdict: tie");
  });
});
