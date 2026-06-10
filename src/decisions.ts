import fs from "node:fs";
import path from "node:path";
import type { DecisionEntry, RoundRecord, ShotManifest } from "./types.js";
import { renderUsage, type UsageTally } from "./usage.js";

export interface ShootMeta {
  usage: UsageTally;
  baseSeed: number;
  contractVersion: number;
}

export function logDecision(shotDir: string, entry: DecisionEntry): void {
  fs.appendFileSync(path.join(shotDir, "decisions.jsonl"), `${JSON.stringify(entry)}\n`);
}

export function writeShotManifest(shotDir: string, manifest: ShotManifest): void {
  fs.writeFileSync(path.join(shotDir, "shot.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function readShotManifest(shotDir: string): ShotManifest {
  const manifestPath = path.join(shotDir, "shot.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No shot.json in ${shotDir} — only shoots made with this version can be re-judged.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ShotManifest;
  if (!Array.isArray(manifest.rounds) || typeof manifest.shotDescription !== "string") {
    throw new Error(`${manifestPath} is not a valid shot manifest`);
  }
  return manifest;
}

export function decisionsForRound(round: RoundRecord): DecisionEntry[] {
  const ts = new Date().toISOString();
  const shippedOrBest = new Set(round.critique.ranking.slice(0, 1));
  return round.candidates.map((candidate) => {
    const critique = round.critique.critiques.find((c) => c.candidate === candidate.id);
    const verdict = critique?.verdict ?? "kill";
    const action: DecisionEntry["action"] =
      verdict === "ship" ? "shipped" : verdict === "kill" ? "killed" : shippedOrBest.has(candidate.id) ? "kept" : "killed";
    return {
      ts,
      round: round.round,
      candidate: candidate.id,
      action,
      reasons: critique?.reasons ?? ["not ranked by critique"],
      paletteAdherence: candidate.checks.palette.adherence,
    };
  });
}

/** Human-readable record of the shoot — committed next to the assets. */
export function renderCritiqueMarkdown(
  shotDescription: string,
  rounds: RoundRecord[],
  finalFile: string | null,
  meta?: ShootMeta,
): string {
  const lines: string[] = [`# Shoot log — ${shotDescription}`, ""];
  if (meta) {
    lines.push(`Judged against direction.md v${meta.contractVersion}.`, "");
  }
  for (const round of rounds) {
    lines.push(`## Round ${round.round}`, "", `**Prompt:** ${round.prompt}`, "");
    for (const candidate of round.candidates) {
      const critique = round.critique.critiques.find((c) => c.candidate === candidate.id);
      lines.push(`### ${candidate.id} — ${critique?.verdict ?? "unrated"}`);
      lines.push(`- Palette adherence (measured): ${candidate.checks.palette.adherence}/100`);
      lines.push(`- Tone (measured): ${candidate.checks.tone.key} key, ${candidate.checks.tone.contrast} contrast`);
      if (!candidate.checks.aspect.ok) {
        lines.push(`- Aspect: WRONG — ${candidate.checks.aspect.actual}, expected ${candidate.checks.aspect.expected}`);
      }
      if (critique) {
        for (const reason of critique.reasons) lines.push(`- ${reason}`);
        for (const violation of critique.neverViolations) lines.push(`- NEVER violation: ${violation}`);
        for (const flaw of critique.technicalFlaws) lines.push(`- Flaw: ${flaw}`);
      }
      lines.push("");
    }
    if (round.critique.ranking.length > 0) {
      lines.push(`**Ranking:** ${round.critique.ranking.join(" > ")}`, "");
    }
    if (round.critique.revisionAdvice) {
      lines.push(`**Revision advice:** ${round.critique.revisionAdvice}`, "");
    }
  }
  lines.push(finalFile ? `## Final\n\nShipped: ${finalFile}` : "## Final\n\nNothing shipped — budget exhausted.", "");
  if (meta) {
    lines.push(
      "## Spend",
      "",
      `- Base seed: ${meta.baseSeed} (re-run with \`shoot --seed ${meta.baseSeed}\` to reproduce)`,
      `- ${renderUsage(meta.usage)}`,
      "",
    );
  }
  return lines.join("\n");
}

export function writeShootRecords(
  shotDir: string,
  shotDescription: string,
  rounds: RoundRecord[],
  finalFile: string | null,
  meta?: ShootMeta,
): void {
  for (const round of rounds) {
    for (const entry of decisionsForRound(round)) logDecision(shotDir, entry);
  }
  fs.writeFileSync(path.join(shotDir, "critique.md"), renderCritiqueMarkdown(shotDescription, rounds, finalFile, meta));
}
