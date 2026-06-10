import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { renderBrandSheet, wrapText } from "../src/brandsheet.js";
import { parseContract } from "../src/contract.js";
import { collectFinals, runExport } from "../src/export.js";
import type { ShotManifest, StyleContract } from "../src/types.js";

const CONTRACT: StyleContract = parseContract(`---
version: 2
name: Sundial & Co <Coffee>
essence: Warm, unhurried mornings rendered with editorial precision.
medium: editorial photography
aspect: 4:5
palette:
  - hex: "#E8DCC8"
    role: background
    name: oat cream
  - hex: "#7A4A2B"
    role: primary
    name: roasted chestnut
  - hex: "#1F3D2E"
    role: accent
    name: deep fir
never:
  - lens flare
  - visible text or lettering
---

## Mood

Quiet confidence; morning light on worn wood.

## Composition

Single subject, generous negative space, low horizon.

## Lighting & lens

Window light from camera left, 50mm, f/2.8.

## Subject treatment

Hands and objects, never full faces.

## Notes

Spring campaign runs March-May.
`);

let tmpDir: string | null = null;
afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
});

describe("wrapText", () => {
  it("wraps at the width without splitting words", () => {
    expect(wrapText("the quick brown fox jumps over the lazy dog", 15)).toEqual([
      "the quick brown",
      "fox jumps over",
      "the lazy dog",
    ]);
  });

  it("hard-breaks words longer than the line", () => {
    expect(wrapText("ab supercalifragilistic", 8)).toEqual(["ab", "supercal", "ifragili", "stic"]);
  });

  it("treats newlines as paragraph breaks", () => {
    expect(wrapText("one two\n\nthree four", 20)).toEqual(["one two", "three four"]);
  });
});

describe("renderBrandSheet", () => {
  const svg = renderBrandSheet(CONTRACT);

  it("renders every palette swatch with hex, name, and role", () => {
    for (const color of CONTRACT.palette) {
      expect(svg).toContain(`fill="${color.hex}"`);
      expect(svg).toContain(color.name);
    }
  });

  it("renders never rules and section bodies", () => {
    expect(svg).toContain("lens flare");
    expect(svg).toContain("Quiet confidence; morning light on worn wood.");
    expect(svg).toContain("direction.md v2");
  });

  it("escapes XML-hostile names", () => {
    expect(svg).toContain("Sundial &amp; Co &lt;Coffee&gt;");
    expect(svg).not.toContain("<Coffee>");
  });

  it("is a parseable standalone SVG with positive dimensions", () => {
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
    expect(height).toBeGreaterThan(400);
  });
});

function fixtureProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-export-"));
  const png = PNG.sync.write(new PNG({ width: 4, height: 5 }));
  const writeShot = (name: string, manifest: Partial<ShotManifest>, withFinal: boolean) => {
    const shotDir = path.join(dir, "shots", name);
    fs.mkdirSync(shotDir, { recursive: true });
    fs.writeFileSync(
      path.join(shotDir, "shot.json"),
      JSON.stringify({
        shotDescription: name,
        baseSeed: 1,
        contractVersion: 1,
        rounds: [],
        finalFile: withFinal ? "final.png" : null,
        ...manifest,
      }),
    );
    if (withFinal) fs.writeFileSync(path.join(shotDir, "final.png"), png);
  };
  writeShot("2026-06-01-hero", {}, true);
  writeShot("2026-06-02-detail", {}, true);
  writeShot("2026-06-03-unshipped", {}, false);
  fs.mkdirSync(path.join(dir, "shots", "not-a-shot"));
  return dir;
}

describe("collectFinals", () => {
  it("finds shipped finals in stable order and skips the rest", () => {
    tmpDir = fixtureProject();
    expect(collectFinals(tmpDir).map((f) => f.id)).toEqual(["2026-06-01-hero", "2026-06-02-detail"]);
  });

  it("returns empty for a project with no shots directory", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-empty-"));
    expect(collectFinals(tmpDir)).toEqual([]);
  });
});

describe("runExport", () => {
  it("writes the full package", () => {
    tmpDir = fixtureProject();
    const messages: string[] = [];
    const result = runExport({ projectDir: tmpDir, contract: CONTRACT, log: (m) => messages.push(m) });

    expect(result.finalCount).toBe(2);
    expect(fs.existsSync(path.join(result.outDir, "brand-sheet.svg"))).toBe(true);
    expect(fs.existsSync(path.join(result.outDir, "finals", "2026-06-01-hero.png"))).toBe(true);
    expect(fs.existsSync(path.join(result.outDir, "finals", "2026-06-03-unshipped.png"))).toBe(false);
    const index = fs.readFileSync(path.join(result.outDir, "index.html"), "utf8");
    expect(index).toContain("2026-06-02-detail");
    expect(index).toContain("brand-sheet.svg");
    // The exported direction.md is the contract, round-trippable.
    expect(parseContract(fs.readFileSync(path.join(result.outDir, "direction.md"), "utf8"))).toEqual(CONTRACT);
    expect(messages[0]).toContain("Exported 2 finals");
  });

  it("honors --out and never overwrites an existing directory", () => {
    tmpDir = fixtureProject();
    const out = path.join(tmpDir, "handoff");
    const first = runExport({ projectDir: tmpDir, contract: CONTRACT, log: () => {}, outDir: out });
    const second = runExport({ projectDir: tmpDir, contract: CONTRACT, log: () => {}, outDir: out });
    expect(first.outDir).toBe(out);
    expect(second.outDir).toBe(`${out}-2`);
  });
});
