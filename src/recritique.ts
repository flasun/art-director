import fs from "node:fs";
import path from "node:path";
import { runChecks } from "./checks.js";
import { getClaudeUsage, resetClaudeUsage } from "./claude.js";
import { renderContactSheet } from "./contactsheet.js";
import { readShotManifest, writeShootRecords } from "./decisions.js";
import { critiqueCandidates } from "./director.js";
import { loadReferencePng } from "./project.js";
import type { Candidate, CritiqueResult, RoundRecord, StyleContract } from "./types.js";

interface RecritiqueDeps {
  directorModel: string;
  contract: StyleContract;
  projectDir: string;
  log: (message: string) => void;
}

/**
 * Re-judges an existing shoot against the current contract — typically
 * after `amend` — overwriting critique.md and the contact sheet in
 * place (git history keeps the old judgement) and appending fresh
 * entries to the decision log. No images are re-rendered.
 */
export async function recritique(deps: RecritiqueDeps, shotDirArg: string): Promise<CritiqueResult> {
  const { contract, log } = deps;
  const shotDir = path.resolve(shotDirArg);
  const manifest = readShotManifest(shotDir);
  resetClaudeUsage();

  const all = manifest.rounds.flatMap((round) =>
    round.candidates.map(({ id, file, seed }) => {
      const png = fs.readFileSync(path.join(shotDir, file));
      const candidate: Candidate = { id, file, seed, checks: runChecks(png, contract) };
      return { candidate, png };
    }),
  );
  if (all.length === 0) {
    throw new Error(`${shotDir} has no candidates to re-judge`);
  }

  log(
    `Re-judging ${all.length} candidates from "${manifest.shotDescription}" ` +
      `against direction.md v${contract.version} (was v${manifest.contractVersion})...`,
  );
  const reference = loadReferencePng(deps.projectDir, manifest.referenceFile, log);
  const critique = await critiqueCandidates(
    deps.directorModel,
    contract,
    manifest.shotDescription,
    all,
    reference,
  );

  const byId = new Map(all.map((entry) => [entry.candidate.id, entry.candidate]));
  const rounds: RoundRecord[] = manifest.rounds.map((round, i) => {
    const ids = new Set(round.candidates.map((c) => c.id));
    return {
      round: round.round,
      prompt: round.prompt,
      candidates: round.candidates.map((c) => byId.get(c.id)!),
      critique: {
        critiques: critique.critiques.filter((c) => ids.has(c.candidate)),
        ranking: critique.ranking.filter((id) => ids.has(id)),
        revisionAdvice: i === manifest.rounds.length - 1 ? critique.revisionAdvice : "",
      },
    };
  });

  writeShootRecords(shotDir, manifest.shotDescription, rounds, manifest.finalFile, {
    usage: { ...getClaudeUsage(), draftRenders: 0, finalRenders: 0 },
    baseSeed: manifest.baseSeed,
    contractVersion: contract.version,
  });
  fs.writeFileSync(
    path.join(shotDir, "contact-sheet.html"),
    renderContactSheet(manifest.shotDescription, rounds, manifest.finalFile),
  );

  for (const c of critique.critiques) {
    log(`  ${c.candidate}: ${c.verdict}${c.reasons[0] ? ` — ${c.reasons[0]}` : ""}`);
  }
  if (critique.ranking.length > 1) log(`  Ranking: ${critique.ranking.join(" > ")}`);
  return critique;
}
