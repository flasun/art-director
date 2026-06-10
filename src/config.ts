export interface Config {
  directorModel: string;
  /** Which image backend renders: "replicate" or "gpt-image". */
  backend: string;
  draftModel: string;
  finalModel: string;
  /** Draft model used when a reference image needs conditioning support. */
  refDraftModel: string;
  openaiImageModel: string;
  falDraftModel: string;
  falFinalModel: string;
  /** fal image-to-image model swapped in when a reference is present. */
  falRefModel: string;
  comfyUrl: string;
  /** Path to a ComfyUI API-format workflow with {{PROMPT}}/{{SEED}}/{{WIDTH}}/{{HEIGHT}} placeholders. */
  comfyWorkflow: string | null;
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
    backend: process.env.ART_DIRECTOR_BACKEND ?? "replicate",
    openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
    draftModel: process.env.REPLICATE_DRAFT_MODEL ?? "black-forest-labs/flux-schnell",
    finalModel: process.env.REPLICATE_FINAL_MODEL ?? "black-forest-labs/flux-1.1-pro",
    refDraftModel: process.env.REPLICATE_REF_DRAFT_MODEL ?? "black-forest-labs/flux-dev",
    falDraftModel: process.env.FAL_DRAFT_MODEL ?? "fal-ai/flux/schnell",
    falFinalModel: process.env.FAL_FINAL_MODEL ?? "fal-ai/flux-pro/v1.1",
    falRefModel: process.env.FAL_REF_MODEL ?? "fal-ai/flux/dev/image-to-image",
    comfyUrl: process.env.COMFYUI_URL ?? "http://127.0.0.1:8188",
    comfyWorkflow: process.env.COMFYUI_WORKFLOW ?? null,
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
