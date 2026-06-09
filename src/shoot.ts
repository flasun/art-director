import fs from "node:fs";
import path from "node:path";
import type { ImageBackend } from "./backends/types.js";
import { runChecks } from "./checks.js";
import type { Config } from "./config.js";
import { renderContactSheet } from "./contactsheet.js";
import { writeShootRecords } from "./decisions.js";
import { compilePrompt, critiqueCandidates, revisePrompt } from "./director.js";
import { createShotDir } from "./project.js";
import type { Candidate, RoundRecord, StyleContract } from "./types.js";

export interface ShootResult {
  shotDir: string;
  finalFile: string | null;
  rounds: RoundRecord[];
}

interface ShootDeps {
  config: Config;
  backend: ImageBackend;
  contract: StyleContract;
  projectDir: string;
  log: (message: string) => void;
}

export async function shoot(deps: ShootDeps, shotDescription: string): Promise<ShootResult> {
  const { config, backend, contract, log } = deps;
  const shotDir = createShotDir(deps.projectDir, shotDescription);
  const rounds: RoundRecord[] = [];

  log(`Compiling Style Contract into a ${backend.id} prompt...`);
  let { prompt, rationale } = await compilePrompt(config.directorModel, contract, shotDescription, backend.dialect);
  log(`  ${rationale}`);

  let shipped: { candidate: Candidate; png: Buffer } | null = null;
  let best: { candidate: Candidate; png: Buffer } | null = null;

  for (let round = 1; round <= config.maxRounds; round++) {
    log(`Round ${round}/${config.maxRounds}: rendering ${config.candidatesPerRound} draft candidates...`);
    const roundDir = path.join(shotDir, `round-${round}`);
    fs.mkdirSync(roundDir, { recursive: true });

    const seeds = Array.from({ length: config.candidatesPerRound }, () => Math.floor(Math.random() * 1_000_000));
    const images = await Promise.all(
      seeds.map((seed) => backend.generate({ prompt, aspect: contract.aspect, seed, quality: "draft" })),
    );

    const candidates = images.map((image, i) => {
      const id = `r${round}-c${i + 1}`;
      const file = path.join(`round-${round}`, `${id}.png`);
      fs.writeFileSync(path.join(shotDir, file), image.buffer);
      const candidate: Candidate = { id, file, seed: image.seed, checks: runChecks(image.buffer, contract) };
      return { candidate, png: image.buffer };
    });

    log("  Critiquing against the contract...");
    const critique = await critiqueCandidates(config.directorModel, contract, shotDescription, candidates);
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
      });
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

  writeShootRecords(shotDir, shotDescription, rounds, finalFile);
  fs.writeFileSync(path.join(shotDir, "contact-sheet.html"), renderContactSheet(shotDescription, rounds, finalFile));
  return { shotDir, finalFile, rounds };
}
