import { describe, expect, it } from "vitest";
import { parseShotList, renderCampaignReport } from "../src/campaign.js";
import { renderCampaignSheet } from "../src/contactsheet.js";
import { addTally, emptyTally } from "../src/usage.js";

describe("parseShotList", () => {
  it("reads one shot per line, skipping blanks and comments", () => {
    const shots = parseShotList(
      ["# spring campaign", "", "hero: pour-over at dawn", "  detail: beans on linen  ", "# todo", "lifestyle: cafe corner"].join(
        "\n",
      ),
    );
    expect(shots).toEqual(["hero: pour-over at dawn", "detail: beans on linen", "lifestyle: cafe corner"]);
  });
});

describe("addTally", () => {
  it("sums every field", () => {
    const total = emptyTally();
    addTally(total, { claudeCalls: 2, inputTokens: 100, outputTokens: 10, draftRenders: 4, finalRenders: 1 });
    addTally(total, { claudeCalls: 1, inputTokens: 50, outputTokens: 5, draftRenders: 4, finalRenders: 0 });
    expect(total).toEqual({ claudeCalls: 3, inputTokens: 150, outputTokens: 15, draftRenders: 8, finalRenders: 1 });
  });
});

const AUDIT = {
  setVerdict: "drifting" as const,
  unifiers: ["Shared oat-cream ground", "Window light from the left"],
  breaks: [{ shot: "2026-06-10-cafe-corner", issue: "Runs cold and blue against the set" }],
  outliers: ["2026-06-10-cafe-corner"],
  advice: "Re-shoot the cafe corner with the contract palette locked.",
};

const DRIFT = {
  pairs: [{ a: "2026-06-10-hero", b: "2026-06-10-cafe-corner", paletteDistance: 31.2 }],
  members: [
    { id: "2026-06-10-hero", meanLuma: 200, lumaDeviation: 10, meanDistanceToOthers: 31.2 },
    { id: "2026-06-10-cafe-corner", meanLuma: 90, lumaDeviation: 55, meanDistanceToOthers: 31.2 },
  ],
  outliers: [{ id: "2026-06-10-cafe-corner", reason: "tonal key deviates by 55 luma from the set mean" }],
  meanPairDistance: 31.2,
};

describe("renderCampaignReport", () => {
  it("renders verdict, breaks, drift, shots, and spend", () => {
    const md = renderCampaignReport(
      "spring",
      2,
      AUDIT,
      DRIFT,
      [
        { id: "2026-06-10-hero", file: "shots/2026-06-10-hero/final.png" },
        { id: "2026-06-10-cafe-corner", file: "shots/2026-06-10-cafe-corner/final.png" },
      ],
      { claudeCalls: 9, inputTokens: 50000, outputTokens: 6000, draftRenders: 16, finalRenders: 2 },
    );
    expect(md).toContain("## Set verdict: drifting");
    expect(md).toContain("Judged against direction.md v2.");
    expect(md).toContain("Runs cold and blue");
    expect(md).toContain("Mean pairwise palette distance");
    expect(md).toContain("shots/2026-06-10-hero/final.png");
    expect(md).toContain("16 draft + 2 final renders");
  });
});

describe("renderCampaignSheet", () => {
  it("marks outliers and escapes content", () => {
    const html = renderCampaignSheet(
      "spring <2026>",
      "drifting",
      [
        { id: "hero", file: "../shots/hero/final.png", outlier: false },
        { id: "cafe", file: "../shots/cafe/final.png", outlier: true, issue: 'Too "cold" & blue' },
      ],
      { unifiers: ["Shared ground"], advice: "Re-shoot the outlier." },
    );
    expect(html).toContain("spring &lt;2026&gt;");
    expect(html).toContain('src="../shots/hero/final.png"');
    expect(html).toContain('class="card outlier"');
    expect(html).toContain("Too &quot;cold&quot; &amp; blue");
    expect(html).toContain("Re-shoot the outlier.");
    expect(html.match(/class="badge"/g)).toHaveLength(1);
  });
});
