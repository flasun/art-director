#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { createReplicateBackend } from "./backends/replicate.js";
import { auditShots, runCampaign } from "./campaign.js";
import { runChecks } from "./checks.js";
import { loadConfig } from "./config.js";
import { serializeContract } from "./contract.js";
import { amendDirection, critiqueCandidates } from "./director.js";
import { runInterview } from "./interview.js";
import { initProject, readContract, writeContract } from "./project.js";
import { recritique } from "./recritique.js";
import { shoot, type ShootReference } from "./shoot.js";
import type { Candidate } from "./types.js";
import { renderUsage } from "./usage.js";

const log = (message: string) => console.log(message);

function loadReference(projectDir: string, refPath: string | undefined): ShootReference | undefined {
  if (!refPath) return undefined;
  const resolved = path.resolve(refPath);
  return { file: path.relative(path.resolve(projectDir), resolved), png: fs.readFileSync(resolved) };
}

const program = new Command();

program
  .name("art-director")
  .description("An AI art director: brief in, on-brand assets out — with the reasoning to show for it.")
  .option("-C, --dir <dir>", "project directory", ".");

program
  .command("init")
  .argument("[dir]", "directory to create the project in", ".")
  .description("Scaffold a new project with a brief.md template")
  .action((dir: string) => {
    const briefPath = initProject(dir);
    log(`Created ${briefPath}`);
    log("Fill in the brief, then run: art-director interview");
  });

program
  .command("interview")
  .option("--probes", "render each forced choice as a pair of probe images (uses the image backend)")
  .description("Run the creative interview and draft direction.md (the Style Contract)")
  .action(async (opts: { probes?: boolean }) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    const backend = opts.probes
      ? createReplicateBackend({
          draftModel: config.draftModel,
          finalModel: config.finalModel,
          refDraftModel: config.refDraftModel,
        })
      : undefined;
    const directionPath = await runInterview({ model: config.directorModel, projectDir, log, backend });
    log(`\nWrote ${directionPath}. Edit it freely — it is the source of truth.`);
    log(`Next: art-director shoot "<what to produce>"`);
  });

program
  .command("shoot")
  .argument("<description...>", "what this shot should depict")
  .option("-r, --rounds <n>", "max critique rounds")
  .option("-c, --candidates <n>", "candidates per round")
  .option("-s, --seed <n>", "base seed for reproducible candidate seeds")
  .option("--ref <image>", "reference image that anchors the subject (image conditioning)")
  .description("Generate, critique, and revise until the shot satisfies the contract")
  .action(async (descriptionParts: string[], opts: { rounds?: string; candidates?: string; seed?: string; ref?: string }) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    if (opts.rounds) config.maxRounds = Number.parseInt(opts.rounds, 10);
    if (opts.candidates) config.candidatesPerRound = Number.parseInt(opts.candidates, 10);
    const baseSeed = opts.seed !== undefined ? Number.parseInt(opts.seed, 10) : undefined;
    const contract = readContract(projectDir);
    const backend = createReplicateBackend({
      draftModel: config.draftModel,
      finalModel: config.finalModel,
      refDraftModel: config.refDraftModel,
    });
    const reference = loadReference(projectDir, opts.ref);

    const result = await shoot(
      { config, backend, contract, projectDir, log, baseSeed, reference },
      descriptionParts.join(" "),
    );
    log(`\nShoot complete: ${result.shotDir}`);
    log(`  Contact sheet: ${path.join(result.shotDir, "contact-sheet.html")}`);
    log(result.finalFile ? `  Final: ${path.join(result.shotDir, result.finalFile)}` : "  No final shipped.");
    log(`  Spend: ${renderUsage(result.usage)}`);
    log(`  Reproduce with: shoot --seed ${result.baseSeed}`);
  });

program
  .command("amend")
  .argument("<feedback...>", "what should change, e.g. \"warmer light, less clutter\"")
  .option("--ref <images...>", "reference image(s) the feedback points at")
  .description("Amend the Style Contract from feedback — the director folds it into direction.md")
  .action(async (feedbackParts: string[], opts: { ref?: string[] }) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    const contract = readContract(projectDir);
    const referenceImages = (opts.ref ?? []).map((file) => fs.readFileSync(file));

    const result = await amendDirection(config.directorModel, contract, feedbackParts.join(" "), referenceImages);
    writeContract(projectDir, serializeContract(result.contract));
    log(`direction.md v${contract.version} -> v${result.contract.version}: ${result.summary}`);
    for (const change of result.changes) log(`  · ${change}`);
    log("Previous version lives in git history — diff it to review the amendment.");
  });

program
  .command("campaign")
  .argument("<shotsFile>", "file with one shot description per line (# comments allowed)")
  .option("--ref <image>", "reference image applied to every shot in the campaign")
  .description("Shoot every line under one contract, then audit the set for consistency")
  .action(async (shotsFile: string, opts: { ref?: string }) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    const contract = readContract(projectDir);
    const backend = createReplicateBackend({
      draftModel: config.draftModel,
      finalModel: config.finalModel,
      refDraftModel: config.refDraftModel,
    });
    const reference = loadReference(projectDir, opts.ref);

    const result = await runCampaign({ config, backend, contract, projectDir, log, reference }, shotsFile);
    log(`\nCampaign complete: ${result.campaignDir}`);
    log(`  Report: ${path.join(result.campaignDir, "report.md")}`);
    log(`  Sheet:  ${path.join(result.campaignDir, "campaign-sheet.html")}`);
    log(`  Spend:  ${renderUsage(result.usage)}`);
  });

program
  .command("audit")
  .argument("<shotDirs...>", "existing shot directories whose finals form the set")
  .option("-n, --name <name>", "campaign name for the report", "set-audit")
  .description("Audit existing finals as a set — do they read as one campaign?")
  .action(async (shotDirs: string[], opts: { name: string }) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    const contract = readContract(projectDir);

    const result = await auditShots({ config, contract, projectDir, log }, shotDirs, opts.name);
    log(`\nAudit complete: ${result.campaignDir}`);
    log(`  Report: ${path.join(result.campaignDir, "report.md")}`);
    log(`  Sheet:  ${path.join(result.campaignDir, "campaign-sheet.html")}`);
  });

program
  .command("recritique")
  .argument("<shotDir>", "an existing shot directory (shots/...)")
  .description("Re-judge a shoot against the current contract — no re-rendering. Pairs with amend.")
  .action(async (shotDir: string) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    const contract = readContract(projectDir);
    await recritique({ directorModel: config.directorModel, contract, projectDir, log }, shotDir);
    log(`\nUpdated critique.md and contact-sheet.html in ${shotDir} (old judgement lives in git history).`);
  });

program
  .command("critique")
  .argument("<images...>", "PNG files to critique against direction.md")
  .description("Critique existing images against the Style Contract")
  .action(async (images: string[]) => {
    const projectDir = program.opts<{ dir: string }>().dir;
    const config = loadConfig();
    const contract = readContract(projectDir);

    const candidates = images.map((file, i) => {
      const png = fs.readFileSync(file);
      const candidate: Candidate = {
        id: path.basename(file, path.extname(file)) || `image-${i + 1}`,
        file,
        seed: 0,
        checks: runChecks(png, contract),
      };
      return { candidate, png };
    });

    const critique = await critiqueCandidates(
      config.directorModel,
      contract,
      "Standalone critique of existing assets",
      candidates,
    );
    for (const c of critique.critiques) {
      log(`\n${c.candidate} — ${c.verdict.toUpperCase()}`);
      const measured = candidates.find((cd) => cd.candidate.id === c.candidate);
      if (measured) log(`  Palette adherence (measured): ${measured.candidate.checks.palette.adherence}/100`);
      for (const reason of c.reasons) log(`  - ${reason}`);
      for (const violation of c.neverViolations) log(`  - NEVER violation: ${violation}`);
      for (const flaw of c.technicalFlaws) log(`  - Flaw: ${flaw}`);
    }
    if (critique.ranking.length > 1) log(`\nRanking: ${critique.ranking.join(" > ")}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
