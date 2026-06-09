import { describe, expect, it } from "vitest";
import { renderContactSheet } from "../src/contactsheet.js";
import { decisionsForRound, renderCritiqueMarkdown } from "../src/decisions.js";
import type { RoundRecord } from "../src/types.js";

const ROUND: RoundRecord = {
  round: 1,
  prompt: 'A quiet kitchen scene with "warm" light & morning steam',
  candidates: [
    {
      id: "r1-c1",
      file: "round-1/r1-c1.png",
      seed: 42,
      checks: {
        palette: { adherence: 91, dominant: [{ hex: "#E8DCC8", weight: 0.8, nearestContractHex: "#E8DCC8", deltaE: 0.4 }] },
        aspect: { ok: true, actual: "1024x1280", expected: "4:5" },
      },
    },
    {
      id: "r1-c2",
      file: "round-1/r1-c2.png",
      seed: 7,
      checks: {
        palette: { adherence: 38, dominant: [{ hex: "#3355FF", weight: 0.7, nearestContractHex: "#E8DCC8", deltaE: 38 }] },
        aspect: { ok: true, actual: "1024x1280", expected: "4:5" },
      },
    },
  ],
  critique: {
    critiques: [
      {
        candidate: "r1-c1",
        paletteNotes: "On palette",
        compositionNotes: "Strong negative space",
        moodNotes: "Right warmth",
        neverViolations: [],
        technicalFlaws: [],
        verdict: "ship",
        reasons: ["Sits squarely on the contract palette", "Composition follows the low-horizon rule"],
      },
      {
        candidate: "r1-c2",
        paletteNotes: "Cold blues",
        compositionNotes: "Cluttered",
        moodNotes: "Clinical",
        neverViolations: ["lens flare"],
        technicalFlaws: ["warped hand"],
        verdict: "kill",
        reasons: ["Palette drifts cold, contradicting the contract"],
      },
    ],
    ranking: ["r1-c1"],
    revisionAdvice: "",
  },
};

describe("renderContactSheet", () => {
  it("renders candidates with verdicts and escaped text", () => {
    const html = renderContactSheet('Hero shot <spring> & "steam"', [ROUND], "final.png");
    expect(html).toContain('src="round-1/r1-c1.png"');
    expect(html).toContain("ship");
    expect(html).toContain("NEVER: lens flare");
    expect(html).toContain("palette 91/100");
    expect(html).toContain("Hero shot &lt;spring&gt; &amp; &quot;steam&quot;");
    expect(html).not.toContain("<spring>");
    expect(html).toContain('src="final.png"');
  });

  it("omits the final section when nothing shipped", () => {
    const html = renderContactSheet("Hero shot", [ROUND], null);
    expect(html).not.toContain(">Final<");
  });
});

describe("decisionsForRound", () => {
  it("maps verdicts to logged actions", () => {
    const decisions = decisionsForRound(ROUND);
    expect(decisions).toHaveLength(2);
    expect(decisions.find((d) => d.candidate === "r1-c1")?.action).toBe("shipped");
    expect(decisions.find((d) => d.candidate === "r1-c2")?.action).toBe("killed");
    expect(decisions.find((d) => d.candidate === "r1-c2")?.paletteAdherence).toBe(38);
  });
});

describe("renderCritiqueMarkdown", () => {
  it("records prompts, verdicts, violations, and the final", () => {
    const md = renderCritiqueMarkdown("Hero shot", [ROUND], "final.png");
    expect(md).toContain("## Round 1");
    expect(md).toContain("r1-c1 — ship");
    expect(md).toContain("NEVER violation: lens flare");
    expect(md).toContain("Shipped: final.png");
  });

  it("notes when nothing shipped", () => {
    const md = renderCritiqueMarkdown("Hero shot", [ROUND], null);
    expect(md).toContain("Nothing shipped");
  });
});
