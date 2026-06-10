import fs from "node:fs";
import path from "node:path";
import type { ImageBackend } from "./backends/types.js";
import { getClaudeUsage, resetClaudeUsage } from "./claude.js";
import { renderCampaignSheet, type CampaignSheetMember } from "./contactsheet.js";
import type { Config } from "./config.js";
import { readShotManifest } from "./decisions.js";
import { auditSet, type SetAudit } from "./director.js";
import { createCampaignDir } from "./project.js";
import { computeSetDrift, renderDriftSummary, type SetDriftReport } from "./setaudit.js";
import { shoot, type ShootReference } from "./shoot.js";
import type { StyleContract } from "./types.js";
import { addTally, emptyTally, renderUsage, type UsageTally } from "./usage.js";

/** One shot description per line; blank lines and #-comments ignored. */
export function parseShotList(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

interface CampaignDeps {
  config: Config;
  backend: ImageBackend;
  contract: StyleContract;
  projectDir: string;
  log: (message: string) => void;
  /** Applied to every shot in the campaign (e.g. the product being sold). */
  reference?: ShootReference;
}

interface AuditDeps {
  config: Config;
  contract: StyleContract;
  projectDir: string;
  log: (message: string) => void;
}

interface FinalMember {
  id: string;
  png: Buffer;
  /** Path to the final, relative to projectDir. */
  file: string;
}

export interface CampaignResult {
  campaignDir: string;
  audit: SetAudit;
  drift: SetDriftReport;
  usage: UsageTally;
}

export function renderCampaignReport(
  campaignName: string,
  contractVersion: number,
  audit: SetAudit,
  drift: SetDriftReport,
  members: { id: string; file: string }[],
  usage: UsageTally,
): string {
  const lines = [
    `# Campaign report — ${campaignName}`,
    "",
    `Judged against direction.md v${contractVersion}.`,
    "",
    `## Set verdict: ${audit.setVerdict}`,
    "",
    "**What unifies the set:**",
    ...audit.unifiers.map((u) => `- ${u}`),
    "",
  ];
  if (audit.breaks.length > 0) {
    lines.push("**What breaks it:**", ...audit.breaks.map((b) => `- ${b.shot}: ${b.issue}`), "");
  }
  if (audit.outliers.length > 0) {
    lines.push(`**Outliers (directed):** ${audit.outliers.join(", ")}`, "");
  }
  if (audit.advice) {
    lines.push(`**Advice:** ${audit.advice}`, "");
  }
  lines.push("## Measured drift", "", renderDriftSummary(drift), "", "## Shots", "");
  for (const member of members) {
    lines.push(`- ${member.id} → ${member.file}`);
  }
  lines.push("", "## Spend", "", `- ${renderUsage(usage)}`, "");
  return lines.join("\n");
}

async function auditFinals(
  deps: AuditDeps,
  campaignName: string,
  members: FinalMember[],
  priorUsage: UsageTally,
): Promise<CampaignResult> {
  const { log } = deps;
  if (members.length < 2) {
    throw new Error(`A set audit needs at least 2 finals; got ${members.length}`);
  }

  log(`Auditing the set: ${members.length} finals against direction.md v${deps.contract.version}...`);
  const drift = computeSetDrift(members);
  resetClaudeUsage();
  const audit = await auditSet(deps.config.directorModel, deps.contract, members, renderDriftSummary(drift));

  const usage = emptyTally();
  addTally(usage, priorUsage);
  addTally(usage, { ...getClaudeUsage(), draftRenders: 0, finalRenders: 0 });

  const campaignDir = createCampaignDir(deps.projectDir, campaignName);
  const measuredOutliers = new Set(drift.outliers.map((o) => o.id));
  const directedOutliers = new Set(audit.outliers);
  const sheetMembers: CampaignSheetMember[] = members.map((m) => ({
    id: m.id,
    file: path.relative(campaignDir, path.join(deps.projectDir, m.file)),
    outlier: measuredOutliers.has(m.id) || directedOutliers.has(m.id),
    issue: audit.breaks.find((b) => b.shot === m.id)?.issue,
  }));

  fs.writeFileSync(
    path.join(campaignDir, "report.md"),
    renderCampaignReport(
      campaignName,
      deps.contract.version,
      audit,
      drift,
      members.map(({ id, file }) => ({ id, file })),
      usage,
    ),
  );
  fs.writeFileSync(
    path.join(campaignDir, "campaign-sheet.html"),
    renderCampaignSheet(campaignName, audit.setVerdict, sheetMembers, {
      unifiers: audit.unifiers,
      advice: audit.advice,
    }),
  );

  log(`  Set verdict: ${audit.setVerdict}`);
  for (const b of audit.breaks) log(`  ${b.shot}: ${b.issue}`);
  for (const o of drift.outliers) log(`  Measured outlier — ${o.id}: ${o.reason}`);
  return { campaignDir, audit, drift, usage };
}

function memberFromShotDir(projectDir: string, shotDirArg: string): FinalMember | null {
  const shotDir = path.resolve(shotDirArg);
  const manifest = readShotManifest(shotDir);
  if (!manifest.finalFile) return null;
  const finalPath = path.join(shotDir, manifest.finalFile);
  return {
    id: path.basename(shotDir),
    png: fs.readFileSync(finalPath),
    file: path.relative(projectDir, finalPath),
  };
}

/** Standalone set audit over existing shot directories. */
export async function auditShots(deps: AuditDeps, shotDirs: string[], name: string): Promise<CampaignResult> {
  const members: FinalMember[] = [];
  for (const dir of shotDirs) {
    const member = memberFromShotDir(deps.projectDir, dir);
    if (member) members.push(member);
    else deps.log(`  Skipping ${dir} — no shipped final.`);
  }
  return auditFinals(deps, name, members, emptyTally());
}

/** Shoot every line of the shot list under one contract, then audit the set. */
export async function runCampaign(deps: CampaignDeps, shotsFile: string): Promise<CampaignResult> {
  const shots = parseShotList(fs.readFileSync(shotsFile, "utf8"));
  if (shots.length < 2) {
    throw new Error(`${shotsFile} needs at least 2 shot descriptions (one per line) for a campaign`);
  }

  const totalUsage = emptyTally();
  const members: FinalMember[] = [];
  for (const [i, description] of shots.entries()) {
    deps.log(`\n=== Shot ${i + 1}/${shots.length}: ${description}`);
    const result = await shoot(deps, description);
    addTally(totalUsage, result.usage);
    if (result.finalFile) {
      const finalPath = path.join(result.shotDir, result.finalFile);
      members.push({
        id: path.basename(result.shotDir),
        png: fs.readFileSync(finalPath),
        file: path.relative(deps.projectDir, finalPath),
      });
    } else {
      deps.log(`  No final shipped for this shot — it will be missing from the set audit.`);
    }
  }

  deps.log("");
  return auditFinals(deps, path.basename(shotsFile, path.extname(shotsFile)), members, totalUsage);
}
