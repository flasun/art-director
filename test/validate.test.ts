import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { parseIntInRange, readPngFile } from "../src/validate.js";

describe("parseIntInRange", () => {
  it("accepts integers inside the range", () => {
    expect(parseIntInRange("--rounds", "3", 1, 6)).toBe(3);
    expect(parseIntInRange("--seed", "0", 0, 10)).toBe(0);
  });

  it("rejects non-integers with the flag name", () => {
    expect(() => parseIntInRange("--rounds", "abc", 1, 6)).toThrow(/--rounds must be an integer/);
    expect(() => parseIntInRange("--rounds", "4.5", 1, 6)).toThrow(/integer/);
    expect(() => parseIntInRange("--seed", "5x", 0, 10)).toThrow(/integer/);
  });

  it("rejects out-of-range values with the bounds", () => {
    expect(() => parseIntInRange("--candidates", "0", 1, 8)).toThrow(/between 1 and 8/);
    expect(() => parseIntInRange("--candidates", "9", 1, 8)).toThrow(/between 1 and 8/);
  });
});

describe("readPngFile", () => {
  let tmpDir: string | null = null;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it("reads a real png", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-validate-"));
    const file = path.join(tmpDir, "ok.png");
    fs.writeFileSync(file, PNG.sync.write(new PNG({ width: 2, height: 2 })));
    expect(readPngFile(file, "--ref image").length).toBeGreaterThan(8);
  });

  it("names the file and purpose when missing", () => {
    expect(() => readPngFile("/nope/missing.png", "--ref image")).toThrow(/--ref image not found: \/nope\/missing.png/);
  });

  it("rejects non-png content with a clear message", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-validate-"));
    const file = path.join(tmpDir, "fake.png");
    fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
    expect(() => readPngFile(file, "critique input")).toThrow(/must be a PNG/);
  });
});
