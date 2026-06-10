import { z } from "zod";
import { directorCall, imageBlock, textBlock } from "./claude.js";
import { contractRubric, normalizeHex, parseContract, serializeContract } from "./contract.js";
import type { Candidate, CritiqueResult, StyleContract } from "./types.js";

const SYSTEM = `You are a seasoned art director with exacting taste. You turn vague client
language into explicit, enforceable visual direction, and you judge work against the brief —
not against your personal preferences. You are decisive: every judgement comes with concrete,
visual reasons a junior could act on. You never pad, hedge, or flatter.`;

/**
 * Renders the cross-project taste prior as prompt context. The brief
 * always outranks it — taste sharpens defaults, never overrides intent.
 */
function tasteContext(taste: string | null | undefined): string {
  if (!taste) return "";
  return `

THE CLIENT'S TASTE PROFILE (a prior learned from their past projects — use it to sharpen
defaults and probe uncertain dimensions, but the BRIEF always outranks it where they conflict):
${taste}`;
}

// ---------------------------------------------------------------------------
// Creative interview

const InterviewQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      dimension: z.string().describe("The visual dimension this probes, e.g. 'color temperature'"),
      question: z.string().describe("A short forced-choice question"),
      optionA: z.string().describe("First option, described vividly in one sentence"),
      optionB: z.string().describe("Second option, described vividly in one sentence"),
    }),
  ),
});

export type InterviewQuestions = z.infer<typeof InterviewQuestionsSchema>;

export async function generateInterview(
  model: string,
  brief: string,
  taste?: string | null,
): Promise<InterviewQuestions> {
  return directorCall({
    model,
    system: SYSTEM,
    schema: InterviewQuestionsSchema,
    schemaName: "interview_questions",
    content: [
      textBlock(
        `Read this creative brief, then design exactly 6 forced-choice questions that will pin down
the client's taste. Each question must probe a DIFFERENT visual dimension (e.g. color temperature,
palette saturation, composition density, lighting character, medium/texture, era/reference).
Options must be concrete and visual — something the client can picture — never abstract labels.
Cover the dimensions the brief leaves most ambiguous.${
          taste
            ? `
A taste profile is provided below: spend fewer questions on dimensions it already settles and
more on what it leaves uncertain or what this brief makes unusual.`
            : ""
        }

BRIEF:
${brief}${tasteContext(taste)}`,
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// Drafting the Style Contract

const DirectionDraftSchema = z.object({
  name: z.string(),
  essence: z.string().describe("One line that captures the visual identity"),
  medium: z.string().describe("e.g. 'editorial photography', 'flat vector illustration'"),
  aspect: z.string().describe("Primary aspect ratio like '4:5' or '16:9'"),
  palette: z.array(
    z.object({
      hex: z.string().describe("Six-digit hex like #E8DCC8"),
      role: z.string().describe("background | primary | accent | shadow | highlight"),
      name: z.string().describe("Evocative color name"),
    }),
  ),
  never: z.array(z.string()).describe("Hard rules — things that must never appear"),
  mood: z.string(),
  composition: z.string(),
  lightingAndLens: z.string(),
  subjectTreatment: z.string(),
  notes: z.string(),
});

type DirectionDraft = z.infer<typeof DirectionDraftSchema>;

/**
 * Converts a director-produced draft into a validated StyleContract:
 * normalizes hexes, falls back on a bad aspect, and round-trips through
 * the serializer so a draft that can't parse never reaches disk.
 */
export function toContract(draft: DirectionDraft, version: number): StyleContract {
  const contract: StyleContract = {
    version,
    name: draft.name,
    essence: draft.essence,
    medium: draft.medium,
    aspect: /^\d+:\d+$/.test(draft.aspect) ? draft.aspect : "4:5",
    palette: draft.palette.map((c) => ({ ...c, hex: normalizeHex(c.hex) })),
    never: draft.never,
    body: {
      mood: draft.mood,
      composition: draft.composition,
      lightingAndLens: draft.lightingAndLens,
      subjectTreatment: draft.subjectTreatment,
      notes: draft.notes,
    },
  };
  return parseContract(serializeContract(contract));
}

export async function draftDirection(
  model: string,
  brief: string,
  interviewTranscript: string,
  taste?: string | null,
): Promise<StyleContract> {
  const draft = await directorCall({
    model,
    system: SYSTEM,
    schema: DirectionDraftSchema,
    schemaName: "style_contract_draft",
    content: [
      textBlock(
        `Draft a Style Contract from this brief and interview. The contract is the project's single
source of truth: every field must be specific enough to enforce in a critique. 4-6 palette colors
with real hex values that work together. 3-6 "never" rules that protect the identity. Body sections
are directorial guidance written for a production artist — concrete nouns, no marketing language.

BRIEF:
${brief}

CREATIVE INTERVIEW (the client's forced choices reveal their taste):
${interviewTranscript}${tasteContext(taste)}`,
      ),
    ],
  });

  return toContract(draft, 1);
}

// ---------------------------------------------------------------------------
// Amending the contract from feedback — the taste-learning loop

const AmendmentSchema = z.object({
  summary: z.string().describe("One line: what changed and why"),
  changes: z.array(z.string()).describe("Each concrete edit made, traceable to the feedback"),
  contract: DirectionDraftSchema,
});

export async function amendDirection(
  model: string,
  current: StyleContract,
  feedback: string,
  referenceImages: Buffer[],
  taste?: string | null,
): Promise<{ contract: StyleContract; summary: string; changes: string[] }> {
  const content = [
    textBlock(
      `Amend this Style Contract based on client feedback. Change ONLY what the feedback demands —
every field the feedback does not touch must be preserved verbatim, including hex values and
phrasing. If reference images are attached, they show what the client is pointing at: identify
what makes them distinct from the current contract (palette temperature, light, density, texture)
and fold THAT into the contract — do not describe the images, extract the underlying rule.

CURRENT STYLE CONTRACT:
${serializeContract(current)}

CLIENT FEEDBACK:
${feedback}${tasteContext(taste)}`,
    ),
    ...referenceImages.map((img) => imageBlock(img)),
  ];

  const result = await directorCall({
    model,
    system: SYSTEM,
    schema: AmendmentSchema,
    schemaName: "contract_amendment",
    content,
  });

  return {
    contract: toContract(result.contract, current.version + 1),
    summary: result.summary,
    changes: result.changes,
  };
}

// ---------------------------------------------------------------------------
// Taste memory — the cross-project style prior

const TasteUpdateSchema = z.object({
  profile: z.string().describe("The complete revised taste profile in markdown"),
  changed: z
    .array(z.string())
    .describe("What was learned or revised this time; empty if the evidence adds nothing durable"),
});

export async function updateTasteProfile(
  model: string,
  currentProfile: string | null,
  source: string,
  evidence: string,
): Promise<{ profile: string; changed: string[] }> {
  return directorCall({
    model,
    system: SYSTEM,
    schema: TasteUpdateSchema,
    schemaName: "taste_update",
    content: [
      textBlock(
        `Maintain the client's cross-project taste profile. Fold the new evidence into the current
profile. Rules:
- Record only DURABLE personal taste (palette leanings, light, density, texture aversions) —
  never project-specific subjects, products, or one-off campaign constraints.
- Strengthen items the evidence confirms; revise or drop items it contradicts.
- Structure: a one-line header ("Taste profile — updated from <source>"), then sections
  "## Leanings", "## Aversions", "## Patterns from choices". Bullets, concrete and visual.
- Keep the whole profile under 400 words. Prefer dropping weak items over growing it.
- If the evidence carries nothing durable, return the profile unchanged and an empty "changed" list.

CURRENT PROFILE:
${currentProfile ?? "(none yet — start one)"}

EVIDENCE SOURCE: ${source}

NEW EVIDENCE:
${evidence}`,
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// Compiling the contract into a backend prompt

const CompiledPromptSchema = z.object({
  prompt: z.string(),
  rationale: z.string().describe("One or two sentences on the key choices"),
});

export async function compilePrompt(
  model: string,
  contract: StyleContract,
  shotDescription: string,
  dialect: string,
  reference?: Buffer,
): Promise<{ prompt: string; rationale: string }> {
  const content = [
    textBlock(
      `Compile this Style Contract and shot description into ONE generation prompt.
The prompt must bake in the contract's palette, lighting, composition and mood so faithfully
that a model that has never seen the contract still produces on-brand work.${
        reference
          ? `

A REFERENCE IMAGE (attached) will be passed to the image model as conditioning: it anchors the
subject. Describe the subject accurately but briefly — match what the reference shows — and spend
most of the prompt on scene, lighting, palette and mood.`
          : ""
      }

BACKEND DIALECT:
${dialect}

STYLE CONTRACT:
${contractRubric(contract)}

SHOT TO PRODUCE:
${shotDescription}`,
    ),
  ];
  if (reference) content.push(imageBlock(reference));
  return directorCall({
    model,
    system: SYSTEM,
    schema: CompiledPromptSchema,
    schemaName: "compiled_prompt",
    content,
  });
}

// ---------------------------------------------------------------------------
// Critique

const CritiqueSchema = z.object({
  critiques: z.array(
    z.object({
      candidate: z.string().describe("The candidate id exactly as given"),
      paletteNotes: z.string(),
      compositionNotes: z.string(),
      moodNotes: z.string(),
      neverViolations: z.array(z.string()).describe("Violated NEVER rules, empty if none"),
      technicalFlaws: z.array(z.string()).describe("Render defects: anatomy, text artifacts, perspective"),
      verdict: z.enum(["ship", "revise", "kill"]),
      reasons: z.array(z.string()).describe("Concrete visual reasons for the verdict"),
    }),
  ),
  ranking: z
    .array(z.string())
    .describe("Candidate ids ordered best-first by contract fit, excluding kills"),
  revisionAdvice: z
    .string()
    .describe("How the prompt should change for the next round; empty if a candidate ships"),
});

export async function critiqueCandidates(
  model: string,
  contract: StyleContract,
  shotDescription: string,
  candidates: { candidate: Candidate; png: Buffer }[],
  reference?: Buffer,
): Promise<CritiqueResult> {
  const content = [
    textBlock(
      `Critique each candidate against the Style Contract. Judge contract fit, not generic
prettiness. A NEVER violation or a visible technical flaw means the candidate cannot ship.
Verdicts: "ship" = on-brand and technically clean as-is; "revise" = right direction, fixable
via prompt changes; "kill" = wrong direction or disqualified.
Rank by pairwise comparison: for each pair, ask which better satisfies the contract.${
        reference
          ? `

A REFERENCE IMAGE is attached first: the subject/product that must stay consistent. Treat
fidelity to the reference as a hard criterion — a candidate whose subject visibly diverges
from the reference cannot ship; note divergences in technicalFlaws.`
          : ""
      }

Measured palette adherence is computed pixel data, not opinion — weigh it accordingly
(100 = dominant colors sit exactly on the contract palette).

STYLE CONTRACT:
${contractRubric(contract)}

SHOT BRIEF:
${shotDescription}`,
    ),
  ];
  if (reference) {
    content.push(textBlock("REFERENCE (the subject that must stay consistent):"), imageBlock(reference));
  }
  for (const { candidate, png } of candidates) {
    content.push(
      textBlock(
        `Candidate "${candidate.id}" — measured palette adherence ${candidate.checks.palette.adherence}/100, ` +
          `dominant colors ${candidate.checks.palette.dominant.map((d) => `${d.hex} (ΔE ${d.deltaE} from ${d.nearestContractHex})`).join(", ")}, ` +
          `tone ${candidate.checks.tone.key} key / ${candidate.checks.tone.contrast} contrast, ` +
          `aspect ${candidate.checks.aspect.ok ? "OK" : `WRONG (${candidate.checks.aspect.actual}, expected ${candidate.checks.aspect.expected})`}:`,
      ),
      imageBlock(png),
    );
  }

  const result = await directorCall({
    model,
    system: SYSTEM,
    schema: CritiqueSchema,
    schemaName: "critique",
    content,
  });

  const ids = new Set(candidates.map((c) => c.candidate.id));
  const ranking = result.ranking.filter((id) => ids.has(id));
  return { ...result, ranking };
}

// ---------------------------------------------------------------------------
// Set audit — do N finals read as one campaign?

const SetAuditSchema = z.object({
  setVerdict: z
    .enum(["coherent", "drifting", "broken"])
    .describe("coherent = reads as one campaign; drifting = mostly unified with leaks; broken = no shared identity"),
  unifiers: z.array(z.string()).describe("What visually holds the set together"),
  breaks: z.array(
    z.object({
      shot: z.string().describe("The shot id exactly as given"),
      issue: z.string().describe("What pulls this shot away from the set"),
    }),
  ),
  outliers: z.array(z.string()).describe("Shot ids that visually leave the set, worst first"),
  advice: z.string().describe("How to bring the set together; empty if coherent"),
});

export type SetAudit = z.infer<typeof SetAuditSchema>;

export async function auditSet(
  model: string,
  contract: StyleContract,
  members: { id: string; png: Buffer }[],
  measuredDrift: string,
): Promise<SetAudit> {
  const content = [
    textBlock(
      `These finals were produced as ONE campaign under the Style Contract below. Audit the SET,
not the individual images: would a stranger flipping past them say they belong together?
Judge palette unity, tonal key, lighting character, composition rhythm, and subject treatment.
Name what unifies, what breaks, and which shots leave the set.

Measured drift is computed pixel data, not opinion — weigh it accordingly.

STYLE CONTRACT:
${contractRubric(contract)}

MEASURED DRIFT:
${measuredDrift}`,
    ),
  ];
  for (const member of members) {
    content.push(textBlock(`Shot "${member.id}":`), imageBlock(member.png));
  }

  const result = await directorCall({
    model,
    system: SYSTEM,
    schema: SetAuditSchema,
    schemaName: "set_audit",
    content,
  });
  const ids = new Set(members.map((m) => m.id));
  return {
    ...result,
    outliers: result.outliers.filter((id) => ids.has(id)),
    breaks: result.breaks.filter((b) => ids.has(b.shot)),
  };
}

// ---------------------------------------------------------------------------
// Cross-model comparison — same contract, two renders

const RenderComparisonSchema = z.object({
  verdict: z
    .enum(["original", "rerender", "tie"])
    .describe("Which render satisfies the Style Contract better"),
  differences: z.array(z.string()).describe("Concrete visual differences, most consequential first"),
  advice: z
    .string()
    .describe("Guidance: which to ship, or what prompt tweak would close the gap on the weaker one"),
});

export type RenderComparison = z.infer<typeof RenderComparisonSchema>;

export async function compareRenders(
  model: string,
  contract: StyleContract,
  shotDescription: string,
  original: Buffer,
  rerendered: Buffer,
  measured: string,
): Promise<RenderComparison> {
  return directorCall({
    model,
    system: SYSTEM,
    schema: RenderComparisonSchema,
    schemaName: "render_comparison",
    content: [
      textBlock(
        `The same shot was rendered twice under the same Style Contract — the ORIGINAL on one image
model, the RE-RENDER on another. Compare them strictly against the contract: palette, mood,
composition, lighting, NEVER rules, technical quality. Differences in model "style" only matter
where the contract takes a side.

Measured values are computed pixel data, not opinion — weigh them accordingly.

STYLE CONTRACT:
${contractRubric(contract)}

SHOT BRIEF:
${shotDescription}

MEASURED:
${measured}`,
      ),
      textBlock("ORIGINAL:"),
      imageBlock(original),
      textBlock("RE-RENDER:"),
      imageBlock(rerendered),
    ],
  });
}

// ---------------------------------------------------------------------------
// Revision

const RevisedPromptSchema = z.object({
  prompt: z.string(),
  changes: z.array(z.string()).describe("Each change made and which critique point it addresses"),
});

export async function revisePrompt(
  model: string,
  contract: StyleContract,
  currentPrompt: string,
  critique: CritiqueResult,
  dialect: string,
): Promise<{ prompt: string; changes: string[] }> {
  return directorCall({
    model,
    system: SYSTEM,
    schema: RevisedPromptSchema,
    schemaName: "revised_prompt",
    content: [
      textBlock(
        `Revise the generation prompt to address the critique. Change only what the critique
demands — keep everything that is working. Every change must trace to a critique point and
stay inside the Style Contract.

BACKEND DIALECT:
${dialect}

STYLE CONTRACT:
${contractRubric(contract)}

CURRENT PROMPT:
${currentPrompt}

CRITIQUE OF THE LATEST ROUND:
${JSON.stringify(critique, null, 2)}`,
      ),
    ],
  });
}
