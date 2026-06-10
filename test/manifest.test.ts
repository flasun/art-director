import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderProbeSheet } from "../src/contactsheet.js";
import { readShotManifest, writeShotManifest } from "../src/decisions.js";
import type { ShotManifest } from "../src/types.js";

const MANIFEST: ShotManifest = {
  shotDescription: "hero image: pour-over at dawn",
  baseSeed: 123456,
  contractVersion: 1,
  referenceFile: "refs/product.png",
  rounds: [
    {
      round: 1,
      prompt: "a quiet kitchen scene",
      candidates: [
        { id: "r1-c1", file: "round-1/r1-c1.png", seed: 123456 },
        { id: "r1-c2", file: "round-1/r1-c2.png", seed: 123457 },
      ],
    },
  ],
  finalFile: "final.png",
};

let tmpDir: string | null = null;

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
});

describe("shot manifest", () => {
  it("round-trips through disk", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-"));
    writeShotManifest(tmpDir, MANIFEST);
    expect(readShotManifest(tmpDir)).toEqual(MANIFEST);
  });

  it("throws a helpful error when shot.json is missing", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-"));
    expect(() => readShotManifest(tmpDir!)).toThrow(/shot\.json/);
  });

  it("rejects files that are not manifests", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-"));
    fs.writeFileSync(path.join(tmpDir, "shot.json"), JSON.stringify({ hello: "world" }));
    expect(() => readShotManifest(tmpDir!)).toThrow(/not a valid/);
  });
});

describe("renderProbeSheet", () => {
  it("renders pairs with escaped questions", () => {
    const html = renderProbeSheet([
      {
        dimension: "color temperature",
        question: 'Warm & "golden" or cool <steel>?',
        fileA: "probes/q1-a.png",
        fileB: "probes/q1-b.png",
      },
    ]);
    expect(html).toContain('src="probes/q1-a.png"');
    expect(html).toContain('src="probes/q1-b.png"');
    expect(html).toContain("Pair 1 — color temperature");
    expect(html).toContain("Warm &amp; &quot;golden&quot; or cool &lt;steel&gt;?");
  });
});
