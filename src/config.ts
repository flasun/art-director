export interface Config {
  directorModel: string;
  draftModel: string;
  finalModel: string;
  maxRounds: number;
  candidatesPerRound: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

export function loadConfig(): Config {
  return {
    directorModel: process.env.ART_DIRECTOR_MODEL ?? "claude-opus-4-8",
    draftModel: process.env.REPLICATE_DRAFT_MODEL ?? "black-forest-labs/flux-schnell",
    finalModel: process.env.REPLICATE_FINAL_MODEL ?? "black-forest-labs/flux-1.1-pro",
    maxRounds: intEnv("ART_DIRECTOR_ROUNDS", 2),
    candidatesPerRound: intEnv("ART_DIRECTOR_CANDIDATES", 4),
  };
}

export function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. ${hint}`);
  }
  return value;
}
