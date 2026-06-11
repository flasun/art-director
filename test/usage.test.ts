import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../src/backends/types.js";
import { seedsForRound, settleRenders } from "../src/shoot.js";
import { addClaudeUsage, addRender, emptyTally, renderUsage } from "../src/usage.js";

describe("usage tally", () => {
  it("accumulates director calls and renders", () => {
    const tally = emptyTally();
    addClaudeUsage(tally, { input_tokens: 1000, output_tokens: 200 });
    addClaudeUsage(tally, { input_tokens: 2500, output_tokens: 300 });
    addRender(tally, "draft");
    addRender(tally, "draft");
    addRender(tally, "final");
    expect(tally).toEqual({
      claudeCalls: 2,
      inputTokens: 3500,
      outputTokens: 500,
      draftRenders: 2,
      finalRenders: 1,
    });
  });

  it("renders a human-readable summary", () => {
    const tally = emptyTally();
    addClaudeUsage(tally, { input_tokens: 12345, output_tokens: 2100 });
    addRender(tally, "draft");
    const summary = renderUsage(tally);
    expect(summary).toContain("1 director calls");
    expect(summary).toContain("12,345 in / 2,100 out");
    expect(summary).toContain("1 draft + 0 final renders");
  });
});

describe("settleRenders", () => {
  const image = (seed: number): GeneratedImage => ({ buffer: Buffer.from("x"), seed, modelId: "m" });

  it("keeps successes and reports failures when at least one render survives", async () => {
    const { images, failures } = await settleRenders([
      Promise.resolve(image(1)),
      Promise.reject(new Error("rate limited")),
      Promise.resolve(image(3)),
    ]);
    expect(images.map((i) => i.seed)).toEqual([1, 3]);
    expect(failures).toEqual(["rate limited"]);
  });

  it("throws only when every render failed", async () => {
    await expect(
      settleRenders([Promise.reject(new Error("down")), Promise.reject(new Error("also down"))]),
    ).rejects.toThrow(/all 2 renders failed — first error: down/);
  });
});

describe("seedsForRound", () => {
  it("is deterministic for the same base seed", () => {
    expect(seedsForRound(42, 1, 4)).toEqual(seedsForRound(42, 1, 4));
    expect(seedsForRound(42, 1, 4)).toEqual([42, 43, 44, 45]);
  });

  it("never overlaps across rounds", () => {
    const all = [1, 2, 3].flatMap((round) => seedsForRound(99, round, 4));
    expect(new Set(all).size).toBe(all.length);
  });

  it("stays within int32 range for large bases", () => {
    for (const seed of seedsForRound(2_147_483_640, 2, 4)) {
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2_147_483_647);
    }
  });
});
