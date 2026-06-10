import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { updateTasteProfile } from "./director.js";

/**
 * The taste profile is a cross-project style prior: a small markdown file
 * the director reads when interviewing, drafting, and amending, and
 * updates from the evidence those flows produce. It lives outside any
 * project because it belongs to the person, not the brand. The brief
 * always outranks it.
 */
export function tasteFilePath(): string {
  return process.env.ART_DIRECTOR_TASTE_FILE ?? path.join(os.homedir(), ".art-director", "taste.md");
}

export function tasteEnabled(): boolean {
  return process.env.ART_DIRECTOR_TASTE !== "off";
}

export function readTasteProfile(): string | null {
  const file = tasteFilePath();
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, "utf8");
  return content.trim() === "" ? null : content;
}

export function writeTasteProfile(content: string): string {
  const file = tasteFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`);
  return file;
}

export function deleteTasteProfile(): boolean {
  const file = tasteFilePath();
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

/**
 * Folds new evidence (interview choices, amendment feedback) into the
 * profile. Never lets a taste failure break the flow that produced the
 * evidence — taste is a bonus, not a dependency.
 */
export async function recordTasteEvidence(
  model: string,
  source: string,
  evidence: string,
  log: (message: string) => void,
): Promise<void> {
  if (!tasteEnabled()) return;
  try {
    const current = readTasteProfile();
    const updated = await updateTasteProfile(model, current, source, evidence);
    if (updated.changed.length === 0) return;
    const file = writeTasteProfile(updated.profile);
    log(`Taste profile updated (${file}):`);
    for (const change of updated.changed) log(`  · ${change}`);
  } catch (error) {
    log(`Taste profile update skipped: ${(error as Error).message}`);
  }
}
