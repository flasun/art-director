import fs from "node:fs";
import path from "node:path";
import { parseContract } from "./contract.js";
import type { StyleContract } from "./types.js";

export const BRIEF_TEMPLATE = `# Creative brief

## What we're making
<!-- The asset(s) you need, e.g. "Hero images for a specialty coffee brand's spring campaign." -->

## Audience
<!-- Who must this land with? -->

## Feeling
<!-- The emotional response you're after, in plain words. -->

## References
<!-- Brands, films, photographers, eras — anything whose look you envy. -->

## Constraints
<!-- Formats, channels, things legal/brand will not allow. -->
`;

export function initProject(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const briefPath = path.join(dir, "brief.md");
  if (fs.existsSync(briefPath)) {
    throw new Error(`${briefPath} already exists — refusing to overwrite`);
  }
  fs.writeFileSync(briefPath, BRIEF_TEMPLATE);
  fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
  return briefPath;
}

export function readBrief(projectDir: string): string {
  const briefPath = path.join(projectDir, "brief.md");
  if (!fs.existsSync(briefPath)) {
    throw new Error(`No brief.md in ${projectDir}. Run "art-director init" first, then fill it in.`);
  }
  const brief = fs.readFileSync(briefPath, "utf8");
  if (brief.trim() === BRIEF_TEMPLATE.trim()) {
    throw new Error("brief.md is still the empty template — fill it in before continuing.");
  }
  return brief;
}

export function readContract(projectDir: string): StyleContract {
  const directionPath = path.join(projectDir, "direction.md");
  if (!fs.existsSync(directionPath)) {
    throw new Error(`No direction.md in ${projectDir}. Run "art-director interview" first.`);
  }
  return parseContract(fs.readFileSync(directionPath, "utf8"));
}

export function writeContract(projectDir: string, serialized: string): string {
  const directionPath = path.join(projectDir, "direction.md");
  fs.writeFileSync(directionPath, serialized);
  return directionPath;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "shot"
  );
}

function createDatedDir(parent: string, name: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}-${slugify(name)}`;
  let dir = path.join(parent, base);
  for (let n = 2; fs.existsSync(dir); n++) {
    dir = path.join(parent, `${base}-${n}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createShotDir(projectDir: string, shotDescription: string): string {
  return createDatedDir(path.join(projectDir, "shots"), shotDescription);
}

export function createCampaignDir(projectDir: string, campaignName: string): string {
  return createDatedDir(path.join(projectDir, "campaigns"), campaignName);
}
