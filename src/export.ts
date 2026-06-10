import fs from "node:fs";
import path from "node:path";
import { renderBrandSheet } from "./brandsheet.js";
import { escapeHtml } from "./contactsheet.js";
import { serializeContract } from "./contract.js";
import { readShotManifest } from "./decisions.js";
import { slugify, uniqueChildDir } from "./project.js";
import type { StyleContract } from "./types.js";

export interface ExportedFinal {
  /** Shot directory basename — becomes the exported file name. */
  id: string;
  sourcePath: string;
}

/** Every shipped final in the project, in stable order. */
export function collectFinals(projectDir: string): ExportedFinal[] {
  const shotsDir = path.join(projectDir, "shots");
  if (!fs.existsSync(shotsDir)) return [];
  const finals: ExportedFinal[] = [];
  for (const entry of fs.readdirSync(shotsDir).sort()) {
    const shotDir = path.join(shotsDir, entry);
    if (!fs.existsSync(path.join(shotDir, "shot.json"))) continue;
    const manifest = readShotManifest(shotDir);
    if (!manifest.finalFile) continue;
    const sourcePath = path.join(shotDir, manifest.finalFile);
    if (!fs.existsSync(sourcePath)) continue;
    finals.push({ id: entry, sourcePath });
  }
  return finals;
}

export function renderExportIndex(contract: StyleContract, finals: ExportedFinal[]): string {
  const cards = finals
    .map(
      (final) => `<figure class="card">
  <img src="finals/${escapeHtml(final.id)}.png" alt="${escapeHtml(final.id)}" loading="lazy" />
  <figcaption>${escapeHtml(final.id)}</figcaption>
</figure>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(contract.name)} — export</title>
<style>
  body { font-family: Georgia, serif; background: #181818; color: #EDEAE2; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; }
  h1 { font-weight: normal; font-style: italic; }
  .board { width: 100%; border-radius: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
  .card { margin: 0; background: #222; border-radius: 6px; overflow: hidden; }
  .card img { width: 100%; display: block; }
  figcaption { padding: .6rem .8rem; font-size: .85rem; color: #B9B4A7; }
  p { color: #8E897D; }
</style>
</head>
<body>
<h1>${escapeHtml(contract.name)}</h1>
<p>${escapeHtml(contract.essence)} — the brand board below is pure SVG: drag it into Figma for editable vectors.</p>
<img class="board" src="brand-sheet.svg" alt="brand board" />
${finals.length > 0 ? `<div class="grid">${cards}</div>` : "<p>No shipped finals yet.</p>"}
</body>
</html>
`;
}

interface ExportDeps {
  projectDir: string;
  contract: StyleContract;
  log: (message: string) => void;
  /** Override the default exports/<date>-<name> destination. */
  outDir?: string;
}

export interface ExportResult {
  outDir: string;
  finalCount: number;
}

/**
 * Writes a self-contained, Figma-ready package: the brand board as pure
 * SVG, the contract itself, every shipped final, and a gallery page.
 */
export function runExport(deps: ExportDeps): ExportResult {
  const { contract, log } = deps;
  const finals = collectFinals(deps.projectDir);

  const outDir = deps.outDir
    ? uniqueChildDir(path.dirname(path.resolve(deps.outDir)), path.basename(deps.outDir))
    : uniqueChildDir(
        path.join(deps.projectDir, "exports"),
        `${new Date().toISOString().slice(0, 10)}-${slugify(contract.name)}`,
      );

  fs.writeFileSync(path.join(outDir, "brand-sheet.svg"), renderBrandSheet(contract));
  fs.writeFileSync(path.join(outDir, "direction.md"), serializeContract(contract));
  fs.writeFileSync(path.join(outDir, "index.html"), renderExportIndex(contract, finals));
  if (finals.length > 0) {
    fs.mkdirSync(path.join(outDir, "finals"), { recursive: true });
    for (const final of finals) {
      fs.copyFileSync(final.sourcePath, path.join(outDir, "finals", `${final.id}.png`));
    }
  }

  log(`Exported ${finals.length} final${finals.length === 1 ? "" : "s"} + brand board to ${outDir}`);
  return { outDir, finalCount: finals.length };
}
