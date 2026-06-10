import YAML from "yaml";
import type { ContractBody, PaletteColor, StyleContract } from "./types.js";

const SECTION_TITLES: Record<keyof ContractBody, string> = {
  mood: "Mood",
  composition: "Composition",
  lightingAndLens: "Lighting & lens",
  subjectTreatment: "Subject treatment",
  notes: "Notes",
};

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const ASPECT_RE = /^\d+:\d+$/;

export function normalizeHex(raw: string): string {
  const m = HEX_RE.exec(raw.trim());
  if (!m) throw new Error(`Invalid hex color: "${raw}"`);
  return `#${m[1]!.toUpperCase()}`;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`direction.md frontmatter: "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function parsePalette(value: unknown): PaletteColor[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('direction.md frontmatter: "palette" must be a non-empty list');
  }
  return value.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`palette[${i}] must be an object with hex/role/name`);
    }
    const e = entry as Record<string, unknown>;
    return {
      hex: normalizeHex(asString(e.hex, `palette[${i}].hex`)),
      role: asString(e.role, `palette[${i}].role`),
      name: typeof e.name === "string" && e.name.trim() !== "" ? e.name.trim() : "unnamed",
    };
  });
}

function parseNever(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error('direction.md frontmatter: "never" must be a list of strings');
  }
  return value.map((v, i) => asString(v, `never[${i}]`));
}

function splitSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const re = /^## +(.+?) *$/gm;
  const headings: { title: string; start: number; end: number }[] = [];
  for (let m = re.exec(markdown); m !== null; m = re.exec(markdown)) {
    headings.push({ title: m[1]!, start: m.index, end: m.index + m[0].length });
  }
  headings.forEach((h, i) => {
    const bodyEnd = i + 1 < headings.length ? headings[i + 1]!.start : markdown.length;
    sections.set(h.title.toLowerCase(), markdown.slice(h.end, bodyEnd).trim());
  });
  return sections;
}

export function parseContract(source: string): StyleContract {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source.trim());
  if (!m) {
    throw new Error("direction.md must start with a YAML frontmatter block (--- ... ---)");
  }
  const front = YAML.parse(m[1]!) as Record<string, unknown>;
  const sections = splitSections(m[2]!);

  const aspect = asString(front.aspect, "aspect");
  if (!ASPECT_RE.test(aspect)) {
    throw new Error(`direction.md frontmatter: "aspect" must look like "4:5", got "${aspect}"`);
  }

  const section = (key: keyof ContractBody): string =>
    sections.get(SECTION_TITLES[key].toLowerCase()) ?? "";

  return {
    version: typeof front.version === "number" ? front.version : 1,
    name: asString(front.name, "name"),
    essence: asString(front.essence, "essence"),
    medium: asString(front.medium, "medium"),
    aspect,
    palette: parsePalette(front.palette),
    never: parseNever(front.never),
    body: {
      mood: section("mood"),
      composition: section("composition"),
      lightingAndLens: section("lightingAndLens"),
      subjectTreatment: section("subjectTreatment"),
      notes: section("notes"),
    },
  };
}

export function serializeContract(contract: StyleContract): string {
  const front = YAML.stringify(
    {
      version: contract.version,
      name: contract.name,
      essence: contract.essence,
      medium: contract.medium,
      aspect: contract.aspect,
      palette: contract.palette,
      never: contract.never,
    },
    { lineWidth: 0 },
  ).trimEnd();

  const body = (Object.keys(SECTION_TITLES) as (keyof ContractBody)[])
    .map((key) => `## ${SECTION_TITLES[key]}\n\n${contract.body[key]}`.trimEnd())
    .join("\n\n");

  return `---\n${front}\n---\n\n${body}\n`;
}

/**
 * Renders the contract as the rubric text used in director prompts —
 * every hard constraint becomes an explicit, checkable line.
 */
export function contractRubric(contract: StyleContract): string {
  const palette = contract.palette
    .map((c) => `  - ${c.hex} (${c.name}, ${c.role})`)
    .join("\n");
  const never = contract.never.length
    ? contract.never.map((n) => `  - ${n}`).join("\n")
    : "  - (none)";
  return [
    `Project: ${contract.name} — ${contract.essence}`,
    `Medium: ${contract.medium}`,
    `Aspect ratio: ${contract.aspect}`,
    `Palette (dominant colors must stay close to these):\n${palette}`,
    `Hard NEVER rules (any violation is disqualifying):\n${never}`,
    `Mood: ${contract.body.mood}`,
    `Composition: ${contract.body.composition}`,
    `Lighting & lens: ${contract.body.lightingAndLens}`,
    `Subject treatment: ${contract.body.subjectTreatment}`,
    contract.body.notes ? `Notes: ${contract.body.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
