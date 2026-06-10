import fs from "node:fs";
import path from "node:path";
import type { ImageBackend } from "./backends/types.js";
import { runChecks } from "./checks.js";
import { getClaudeUsage, resetClaudeUsage } from "./claude.js";
import type { Config } from "./config.js";
import { renderContactSheet } from "./contactsheet.js";
import { writeShootRecords, writeShotManifest } from "./decisions.js";
import { compilePrompt, critiqueCandidates, revisePrompt } from "./director.js";
import { createShotDir } from "./project.js";
import type { Candidate, RoundRecord, StyleContract } from "./types.js";
import type { UsageTally } from "./usage.js";

export interface ShootResult {
  shotDir: string;
  finalFile: string | null;
  rounds: RoundRecord[];
  usage: UsageTally;
  baseSeed: number;
}

export interface ShootReference {
  /** Path relative to the project dir, recorded in the manifest. */
  file: string;
  png: Buffer;
}

interface ShootDeps {
  config: Config;
  backend: ImageBackend;
  contract: StyleContract;
  projectDir: string;
  log: (message: string) => void;
  /** Pin for reproducible candidate seeds; omit for a random shoot. */
  baseSeed?: number;
  /** Subject/product reference that conditions generation and critique. */
  reference?: ShootReference;
}

/** Deterministic, non-overlapping seeds: same base seed, same shoot. */
export function seedsForRound(baseSeed: number, round: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (baseSeed + (round - 1) * count + i) % 2_147_483_647);
}

export async function shoot(deps: ShootDeps, shotDescription: string): Promise<ShootResult> {
  const { config, backend, contract, log, reference } = deps;
  const baseSeed = deps.baseSeed ?? Math.floor(Math.random() * 1_000_000_000);
  const shotDir = createShotDir(deps.projectDir, shotDescription);
  const rounds: RoundRecord[] = [];
  let draftRenders = 0;
  let finalRenders = 0;
  resetClaudeUsage();

  if (reference) log(`Using reference ${reference.file} to anchor the subject.`);
  log(`Compiling Style Contract into a ${backend.id} prompt...`);
  let { prompt, rationale } = await compilePrompt(
    config.directorModel,
    contract,
    shotDescription,
    backend.dialect,
    reference?.png,
  );
  log(`  ${rationale}`);

  let shipped: { candidate: Candidate; png: Buffer } | null = null;
  let best: { candidate: Candidate; png: Buffer } | null = null;

  for (let round = 1; round <= config.maxRounds; round++) {
    log(`Round ${round}/${config.maxRounds}: rendering ${config.candidatesPerRound} draft candidates...`);
    const roundDir = path.join(shotDir, `round-${round}`);
    fs.mkdirSync(roundDir, { recursive: true });

    const seeds = seedsForRound(baseSeed, round, config.candidatesPerRound);
    const images = await Promise.all(
      seeds.map((seed) =>
        backend.generate({
          prompt,
          aspect: contract.aspect,
          seed,
          quality: "draft",
          referenceImage: reference?.png,
        }),
      ),
    );
    draftRenders += images.length;

    const candidates = images.map((image, i) => {
      const id = `r${round}-c${i + 1}`;
      const file = path.join(`round-${round}`, `${id}.png`);
      fs.writeFileSync(path.join(shotDir, file), image.buffer);
      const candidate: Candidate = { id, file, seed: image.seed, checks: runChecks(image.buffer, contract) };
      return { candidate, png: image.buffer };
    });

    log("  Critiquing against the contract...");
    const critique = await critiqueCandidates(
      config.directorModel,
      contract,
      shotDescription,
      candidates,
      reference?.png,
    );
    rounds.push({ round, prompt, candidates: candidates.map((c) => c.candidate), critique });

    for (const c of critique.critiques) {
      log(`  ${c.candidate}: ${c.verdict}${c.reasons[0] ? ` — ${c.reasons[0]}` : ""}`);
    }

    const topId = critique.ranking[0];
    const top = candidates.find((c) => c.candidate.id === topId) ?? null;
    if (top) best = top;

    const shipVerdict = critique.critiques.find(
      (c) => c.verdict === "ship" && critique.ranking.includes(c.candidate),
    );
    if (shipVerdict) {
      shipped = candidates.find((c) => c.candidate.id === shipVerdict.candidate) ?? top;
      log(`  ${shipVerdict.candidate} ships.`);
      break;
    }

    if (round < config.maxRounds) {
      log("  Revising prompt...");
      const revision = await revisePrompt(config.directorModel, contract, prompt, critique, backend.dialect);
      prompt = revision.prompt;
      for (const change of revision.changes) log(`    · ${change}`);
    }
  }

  let finalFile: string | null = null;
  const winner = shipped ?? best;
  if (winner) {
    log(`Rendering final at full quality (seed ${winner.candidate.seed})...`);
    try {
      const final = await backend.generate({
        prompt,
        aspect: contract.aspect,
        seed: winner.candidate.seed,
        quality: "final",
        referenceImage: reference?.png,
      });
      finalRenders += 1;
      finalFile = "final.png";
      fs.writeFileSync(path.join(shotDir, finalFile), final.buffer);
    } catch (error) {
      // The draft winner is still a usable deliverable — keep it rather than failing the shoot.
      log(`  Final render failed (${(error as Error).message}); promoting the draft winner.`);
      finalFile = winner.candidate.file;
    }
    if (!shipped) {
      log("  Note: budget exhausted before any candidate earned a 'ship' — review the contact sheet.");
    }
  }

  const usage: UsageTally = { ...getClaudeUsage(), draftRenders, finalRenders };
  writeShootRecords(shotDir, shotDescription, rounds, finalFile, {
    usage,
    baseSeed,
    contractVersion: contract.version,
  });
  fs.writeFileSync(path.join(shotDir, "contact-sheet.html"), renderContactSheet(shotDescription, rounds, finalFile));
  writeShotManifest(shotDir, {
    shotDescription,
    baseSeed,
    contractVersion: contract.version,
    referenceFile: reference?.file ?? null,
    rounds: rounds.map((r) => ({
      round: r.round,
      prompt: r.prompt,
      candidates: r.candidates.map(({ id, file, seed }) => ({ id, file, seed })),
    })),
    finalFile,
  });
  return { shotDir, finalFile, rounds, usage, baseSeed };
}
