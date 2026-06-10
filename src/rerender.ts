import fs from "node:fs";
import path from "node:path";
import type { ImageBackend } from "./backends/types.js";
import { runChecks } from "./checks.js";
import { getClaudeUsage, resetClaudeUsage } from "./claude.js";
import type { Config } from "./config.js";
import { readShotManifest } from "./decisions.js";
import { compareRenders, compilePrompt, type RenderComparison } from "./director.js";
import { loadReferencePng, uniqueChildDir } from "./project.js";
import { computeSetDrift } from "./setaudit.js";
import type { DeterministicChecks, StyleContract } from "./types.js";
import { renderUsage, type UsageTally } from "./usage.js";

interface RerenderDeps {
  config: Config;
  backend: ImageBackend;
  contract: StyleContract;
  projectDir: string;
  log: (message: string) => void;
}

export interface RerenderResult {
  outDir: string;
  comparison: RenderComparison;
  usage: UsageTally;
}

export function renderRerenderReport(args: {
  shotDescription: string;
  backendId: string;
  rerenderModelId: string;
  originalModelId: string | null;
  contractVersion: number;
  prompt: string;
  comparison: RenderComparison;
  originalChecks: DeterministicChecks;
  rerenderChecks: DeterministicChecks;
  paletteDistance: number;
  usage: UsageTally;
}): string {
  const checksLine = (label: string, checks: DeterministicChecks) =>
    `- ${label}: palette ${checks.palette.adherence}/100, ${checks.tone.key} key / ${checks.tone.contrast} contrast` +
    (checks.aspect.ok ? "" : `, aspect WRONG (${checks.aspect.actual})`);
  return [
    `# Re-render — ${args.shotDescription}`,
    "",
    `Judged against direction.md v${args.contractVersion}.`,
    "",
    `Original: ${args.originalModelId ?? "unknown model"} · Re-render: ${args.rerenderModelId} (${args.backendId})`,
    "",
    `## Verdict: ${args.comparison.verdict}`,
    "",
    "**Differences:**",
    ...args.comparison.differences.map((d) => `- ${d}`),
    "",
    args.comparison.advice ? `**Advice:** ${args.comparison.advice}` : "",
    "",
    "## Measured",
    "",
    checksLine("Original", args.originalChecks),
    checksLine("Re-render", args.rerenderChecks),
    `- Palette distance between the two: ΔE ${args.paletteDistance}`,
    "",
    "## Prompt (recompiled for this backend's dialect)",
    "",
    args.prompt,
    "",
    "## Spend",
    "",
    `- ${renderUsage(args.usage)}`,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Same contract, different model: recompiles the prompt for the target
 * backend's dialect, renders one final, and has the director compare it
 * against the shipped original. Writes rerenders/<backend>[-n]/ inside
 * the shot directory.
 */
export async function rerender(deps: RerenderDeps, shotDirArg: string): Promise<RerenderResult> {
  const { config, backend, contract, log } = deps;
  const shotDir = path.resolve(shotDirArg);
  const manifest = readShotManifest(shotDir);
  if (!manifest.finalFile) {
    throw new Error(`${shotDir} shipped no final — nothing to re-render against.`);
  }
  const original = fs.readFileSync(path.join(shotDir, manifest.finalFile));
  const reference = loadReferencePng(deps.projectDir, manifest.referenceFile, log);
  resetClaudeUsage();

  log(`Recompiling the contract for the ${backend.id} dialect...`);
  const { prompt } = await compilePrompt(
    config.directorModel,
    contract,
    manifest.shotDescription,
    backend.dialect,
    reference,
  );

  log(`Rendering on ${backend.id} at full quality...`);
  const image = await backend.generate({
    prompt,
    aspect: contract.aspect,
    seed: manifest.baseSeed,
    quality: "final",
    referenceImage: reference,
  });

  const originalChecks = runChecks(original, contract);
  const rerenderChecks = runChecks(image.buffer, contract);
  const drift = computeSetDrift([
    { id: "original", png: original },
    { id: "rerender", png: image.buffer },
  ]);
  const paletteDistance = drift.pairs[0]?.paletteDistance ?? 0;

  log("Comparing both renders against the contract...");
  const measured = [
    `Original: palette adherence ${originalChecks.palette.adherence}/100, tone ${originalChecks.tone.key}/${originalChecks.tone.contrast}`,
    `Re-render: palette adherence ${rerenderChecks.palette.adherence}/100, tone ${rerenderChecks.tone.key}/${rerenderChecks.tone.contrast}`,
    `Palette distance between the two: ΔE ${paletteDistance}`,
  ].join("\n");
  const comparison = await compareRenders(
    config.directorModel,
    contract,
    manifest.shotDescription,
    original,
    image.buffer,
    measured,
  );

  const usage: UsageTally = { ...getClaudeUsage(), draftRenders: 0, finalRenders: 1 };
  const outDir = uniqueChildDir(path.join(shotDir, "rerenders"), backend.id);
  fs.writeFileSync(path.join(outDir, "rerender.png"), image.buffer);
  fs.writeFileSync(
    path.join(outDir, "report.md"),
    renderRerenderReport({
      shotDescription: manifest.shotDescription,
      backendId: backend.id,
      rerenderModelId: image.modelId,
      originalModelId: manifest.finalModelId ?? null,
      contractVersion: contract.version,
      prompt,
      comparison,
      originalChecks,
      rerenderChecks,
      paletteDistance,
      usage,
    }),
  );

  log(`  Verdict: ${comparison.verdict}`);
  for (const difference of comparison.differences) log(`  · ${difference}`);
  return { outDir, comparison, usage };
}
