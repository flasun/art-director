import type { StyleContract } from "./types.js";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Greedy word wrap; hard-breaks words longer than the line. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (let word of words) {
      while (word.length > maxChars) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (line === "") line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

const WIDTH = 960;
const MARGIN = 48;
const SWATCH = 116;
const SWATCH_GAP = 24;
const PER_ROW = Math.floor((WIDTH - 2 * MARGIN + SWATCH_GAP) / (SWATCH + SWATCH_GAP));

/**
 * Renders the Style Contract as a single self-contained SVG brand board.
 * Pure vectors and text — drags into Figma (or anything else) as
 * editable shapes, not a screenshot.
 */
export function renderBrandSheet(contract: StyleContract): string {
  const parts: string[] = [];
  let y = MARGIN + 36;

  const text = (
    content: string,
    opts: { size: number; fill?: string; style?: string; family?: string; x?: number },
  ) => {
    parts.push(
      `<text x="${opts.x ?? MARGIN}" y="${y}" font-family="${opts.family ?? "Georgia, serif"}" ` +
        `font-size="${opts.size}" fill="${opts.fill ?? "#EDEAE2"}"${opts.style ? ` ${opts.style}` : ""}>` +
        `${escapeXml(content)}</text>`,
    );
  };
  const sectionTitle = (title: string) => {
    y += 44;
    text(title.toUpperCase(), { size: 13, fill: "#8E897D", style: 'letter-spacing="2"' });
    y += 24;
  };
  const wrapped = (content: string, size: number, lineHeight: number, fill = "#CFCABD") => {
    for (const line of wrapText(content, 92)) {
      text(line, { size, fill });
      y += lineHeight;
    }
  };

  // Header
  text(contract.name, { size: 40, style: 'font-style="italic"' });
  y += 30;
  wrapped(contract.essence, 17, 26, "#B9B4A7");
  y += 4;
  text(`${contract.medium}  ·  ${contract.aspect}  ·  direction.md v${contract.version}`, {
    size: 13,
    fill: "#8E897D",
  });

  // Palette
  sectionTitle("Palette");
  contract.palette.forEach((color, i) => {
    const col = i % PER_ROW;
    const row = Math.floor(i / PER_ROW);
    const x = MARGIN + col * (SWATCH + SWATCH_GAP);
    const top = y + row * (SWATCH + 64);
    parts.push(
      `<rect x="${x}" y="${top}" width="${SWATCH}" height="${SWATCH}" rx="8" fill="${escapeXml(color.hex)}"/>`,
      `<text x="${x}" y="${top + SWATCH + 20}" font-family="ui-monospace, monospace" font-size="13" fill="#EDEAE2">${escapeXml(color.hex)}</text>`,
      `<text x="${x}" y="${top + SWATCH + 38}" font-family="Georgia, serif" font-size="12" fill="#8E897D">${escapeXml(`${color.name} · ${color.role}`)}</text>`,
    );
  });
  y += Math.ceil(contract.palette.length / PER_ROW) * (SWATCH + 64);

  // Never rules
  if (contract.never.length > 0) {
    sectionTitle("Never");
    for (const rule of contract.never) {
      text(`✕  ${rule}`, { size: 15, fill: "#E07B7B" });
      y += 24;
    }
  }

  // Directorial sections
  const sections: [string, string][] = [
    ["Mood", contract.body.mood],
    ["Composition", contract.body.composition],
    ["Lighting & lens", contract.body.lightingAndLens],
    ["Subject treatment", contract.body.subjectTreatment],
    ["Notes", contract.body.notes],
  ];
  for (const [title, body] of sections) {
    if (!body.trim()) continue;
    sectionTitle(title);
    wrapped(body, 15, 23);
  }

  const height = y + MARGIN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
<rect width="${WIDTH}" height="${height}" fill="#181818"/>
${parts.join("\n")}
</svg>
`;
}
