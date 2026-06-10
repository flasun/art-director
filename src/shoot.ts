import fs from "node:fs";
import path from "node:path";
import type { GeneratedImage, ImageBackend } from "./backends/types.js";
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

/**
 * One flaky render must not sink a round of paid renders: keep every
 * success, report every failure, and only give up when nothing survived.
 */
export async function settleRenders(
  tasks: Promise<GeneratedImage>[],
): Promise<{ images: GeneratedImage[]; failures: string[] }> {
  const settled = await Promise.allSettled(tasks);
  const images = settled
    .filter((s): s is PromiseFulfilledResult<GeneratedImage> => s.status === "fulfilled")
    .map((s) => s.value);
  const failures = settled
    .filter((s): s is PromiseRejectedResult => s.status === "rejected")
    .map((s) => (s.reason instanceof Error ? s.reason.message : String(s.reason)));
  if (images.length === 0 && failures.length > 0) {
    throw new Error(`all ${failures.length} renders failed — first error: ${failures[0]}`);
  }
  return { images, failures };
}

export async function shoot(deps: ShootDeps, shotDescription: string): Promise<ShootResult> {
  const { config, backend, contract, log, reference } = deps;
  const baseSeed = deps.baseSeed ?? Math.floor(Math.random() * 1_000_000_000);
  const shotDir = createShotDir(deps.projectDir, shotDescription);
  const rounds: RoundRecord[] = [];
  let draftRenders = 0;
  let finalRenders = 0;
  resetClaudeUsage();

  const persist = (shippedFile: string | null, shippedModelId: string | null): UsageTally => {
    const usage: UsageTally = { ...getClaudeUsage(), draftRenders, finalRenders };
    writeShootRecords(shotDir, shotDescription, rounds, shippedFile, {
      usage,
      baseSeed,
      contractVersion: contract.version,
    });
    fs.writeFileSync(path.join(shotDir, "contact-sheet.html"), renderContactSheet(shotDescription, rounds, shippedFile));
    writeShotManifest(shotDir, {
      shotDescription,
      baseSeed,
      contractVersion: contract.version,
      referenceFile: reference?.file ?? null,
      finalModelId: shippedModelId,
      rounds: rounds.map((r) => ({
        round: r.round,
        prompt: r.prompt,
        candidates: r.candidates.map(({ id, file, seed }) => ({ id, file, seed })),
      })),
      finalFile: shippedFile,
    });
    return usage;
  };

  try {
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
      const { images, failures } = await settleRenders(
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
      for (const failure of failures) {
        log(`  Render failed (continuing with ${images.length} candidates): ${failure}`);
      }
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
    let finalModelId: string | null = null;
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
        finalModelId = final.modelId;
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

    const usage = persist(finalFile, finalModelId);
    return { shotDir, finalFile, rounds, usage, baseSeed };
  } catch (error) {
    // Renders already paid for must survive a crash: keep the partial audit trail.
    if (rounds.length > 0) {
      persist(null, null);
      log(
        `Shoot aborted after ${rounds.length} completed round(s) — partial records written to ${shotDir}. ` +
          `(${(error as Error).message})`,
      );
    }
    throw error;
  }
}
