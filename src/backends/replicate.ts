import { requireEnv } from "../config.js";
import type { GeneratedImage, GenerateRequest, ImageBackend } from "./types.js";

const API_BASE = "https://api.replicate.com/v1";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: { get?: string };
}

async function replicateFetch(url: string, token: string, init?: RequestInit): Promise<Prediction> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Replicate API ${res.status}: ${detail.slice(0, 500)}`);
  }
  return (await res.json()) as Prediction;
}

async function awaitPrediction(first: Prediction, token: string): Promise<Prediction> {
  let prediction = first;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (!prediction.urls?.get) {
      throw new Error("Replicate prediction is pending but has no polling URL");
    }
    if (Date.now() > deadline) {
      throw new Error(`Replicate prediction ${prediction.id} timed out after 5 minutes`);
    }
    await new Promise((r) => setTimeout(r, 1500));
    prediction = await replicateFetch(prediction.urls.get, token);
  }
  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate prediction ${prediction.id} ${prediction.status}: ${prediction.error ?? "unknown error"}`);
  }
  return prediction;
}

export function createReplicateBackend(opts: { draftModel: string; finalModel: string }): ImageBackend {
  return {
    id: "replicate",
    dialect:
      "Flux-family models on Replicate. Write one flowing natural-language paragraph (not tag soup): " +
      "subject first, then setting, lighting, lens/camera language, color palette named as plain " +
      "color words AND hex codes, and mood. Be concrete and visual; avoid negations (the model " +
      "ignores 'no X' — describe what should be there instead). Keep it under 130 words.",

    async generate(req: GenerateRequest): Promise<GeneratedImage> {
      const token = requireEnv(
        "REPLICATE_API_TOKEN",
        "Create a token at https://replicate.com/account/api-tokens and put it in .env",
      );
      const model = req.quality === "draft" ? opts.draftModel : opts.finalModel;

      const created = await replicateFetch(`${API_BASE}/models/${model}/predictions`, token, {
        method: "POST",
        body: JSON.stringify({
          input: {
            prompt: req.prompt,
            aspect_ratio: req.aspect,
            output_format: "png",
            seed: req.seed,
          },
        }),
      });
      const done = await awaitPrediction(created, token);

      const url = Array.isArray(done.output) ? done.output[0] : done.output;
      if (!url) {
        throw new Error(`Replicate prediction ${done.id} succeeded but returned no output URL`);
      }
      const imageRes = await fetch(url);
      if (!imageRes.ok) {
        throw new Error(`Failed to download generated image (${imageRes.status}) from ${url}`);
      }
      return {
        buffer: Buffer.from(await imageRes.arrayBuffer()),
        seed: req.seed,
        modelId: model,
      };
    },
  };
}
