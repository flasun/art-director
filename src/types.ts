export interface PaletteColor {
  hex: string;
  role: string;
  name: string;
}

/**
 * The Style Contract — the project's core artifact. Human-readable as
 * direction.md, machine-enforceable as a critique rubric, and compiled
 * into model-specific prompts. The frontmatter fields are the hard,
 * checkable constraints; the body sections are directorial guidance.
 */
export interface StyleContract {
  version: number;
  name: string;
  essence: string;
  medium: string;
  aspect: string;
  palette: PaletteColor[];
  never: string[];
  body: ContractBody;
}

export interface ContractBody {
  mood: string;
  composition: string;
  lightingAndLens: string;
  subjectTreatment: string;
  notes: string;
}

export type Verdict = "ship" | "revise" | "kill";

export interface CandidateCritique {
  candidate: string;
  paletteNotes: string;
  compositionNotes: string;
  moodNotes: string;
  neverViolations: string[];
  technicalFlaws: string[];
  verdict: Verdict;
  reasons: string[];
}

export interface CritiqueResult {
  critiques: CandidateCritique[];
  /** Candidate ids ordered best-first, kills excluded. */
  ranking: string[];
  revisionAdvice: string;
}

export interface PaletteCheck {
  /** 0-100; 100 = dominant colors sit exactly on the contract palette. */
  adherence: number;
  dominant: { hex: string; weight: number; nearestContractHex: string; deltaE: number }[];
}

export interface AspectCheck {
  ok: boolean;
  actual: string;
  expected: string;
}

export interface DeterministicChecks {
  palette: PaletteCheck;
  aspect: AspectCheck;
}

export interface Candidate {
  id: string;
  file: string;
  seed: number;
  checks: DeterministicChecks;
}

export interface DecisionEntry {
  ts: string;
  round: number;
  candidate: string;
  action: "kept" | "killed" | "revised" | "shipped";
  reasons: string[];
  paletteAdherence?: number;
}

export interface RoundRecord {
  round: number;
  prompt: string;
  candidates: Candidate[];
  critique: CritiqueResult;
}
