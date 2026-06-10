import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteTasteProfile,
  readTasteProfile,
  tasteEnabled,
  tasteFilePath,
  writeTasteProfile,
} from "../src/taste.js";

let tmpDir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv.ART_DIRECTOR_TASTE_FILE = process.env.ART_DIRECTOR_TASTE_FILE;
  savedEnv.ART_DIRECTOR_TASTE = process.env.ART_DIRECTOR_TASTE;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-director-taste-"));
  process.env.ART_DIRECTOR_TASTE_FILE = path.join(tmpDir, "nested", "taste.md");
  delete process.env.ART_DIRECTOR_TASTE;
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("tasteFilePath", () => {
  it("honors the env override", () => {
    expect(tasteFilePath()).toBe(path.join(tmpDir, "nested", "taste.md"));
  });

  it("defaults to ~/.art-director/taste.md", () => {
    delete process.env.ART_DIRECTOR_TASTE_FILE;
    expect(tasteFilePath()).toBe(path.join(os.homedir(), ".art-director", "taste.md"));
  });
});

describe("tasteEnabled", () => {
  it("is on by default and off with ART_DIRECTOR_TASTE=off", () => {
    expect(tasteEnabled()).toBe(true);
    process.env.ART_DIRECTOR_TASTE = "off";
    expect(tasteEnabled()).toBe(false);
  });
});

describe("profile read/write/delete", () => {
  it("reads null when no profile exists", () => {
    expect(readTasteProfile()).toBeNull();
  });

  it("round-trips content, creating parent directories and a trailing newline", () => {
    const file = writeTasteProfile("## Leanings\n- warm palettes");
    expect(file).toBe(tasteFilePath());
    expect(readTasteProfile()).toBe("## Leanings\n- warm palettes\n");
  });

  it("treats a whitespace-only file as no profile", () => {
    writeTasteProfile("   \n");
    expect(readTasteProfile()).toBeNull();
  });

  it("deletes and reports whether anything was there", () => {
    expect(deleteTasteProfile()).toBe(false);
    writeTasteProfile("x");
    expect(deleteTasteProfile()).toBe(true);
    expect(readTasteProfile()).toBeNull();
  });
});
