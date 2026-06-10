import { requireEnv } from "../config.js";
import { aspectDimensions, downscalePng, isPng, pngDataUri } from "../image.js";
import { FLUX_DIALECT } from "./replicate.js";
import type { GeneratedImage, GenerateRequest, ImageBackend } from "./types.js";

const QUEUE_BASE = "https://queue.fal.run";
const REFERENCE_MAX_EDGE = 768;

export interface FalPlan {
  model: string;
  input: Record<string, unknown>;
}

/**
 * fal takes explicit width/height and, for image conditioning, a
 * dedicated image-to-image model with image_url + strength. Text-only
 * models are swapped for the configured img2img model when a reference
 * is present, mirroring the Replicate backend's draft-model swap.
 */
export function buildFalPlan(
  model: string,
  req: GenerateRequest,
  referenceUri: string | undefined,
  refModel: string,
): FalPlan {
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    image_size: aspectDimensions(req.aspect),
    seed: req.seed,
    num_images: 1,
    output_format: "png",
  };
  if (!referenceUri) return { model, input };

  const target = model.includes("image-to-image") ? model : refModel;
  input.image_url = referenceUri;
  input.strength = 0.85;
  return { model: target, input };
}

interface QueueSubmit {
  request_id?: string;
  status_url?: string;
  response_url?: string;
}

interface QueueStatus {
  status?: string;
  error?: unknown;
}

interface FalOutput {
  images?: { url?: string }[];
}

async function falFetch<T>(url: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fal API ${res.status}: ${detail.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export function createFalBackend(opts: { draftModel: string; finalModel: string; refModel: string }): ImageBackend {
  return {
    id: "fal",
    dialect: FLUX_DIALECT,

    async generate(req: GenerateRequest): Promise<GeneratedImage> {
      const key = requireEnv("FAL_KEY", "Create a key at https://fal.ai/dashboard/keys and put it in .env");
      const referenceUri = req.referenceImage
        ? pngDataUri(downscalePng(req.referenceImage, REFERENCE_MAX_EDGE))
        : undefined;
      const baseModel = req.quality === "draft" ? opts.draftModel : opts.finalModel;
      const plan = buildFalPlan(baseModel, req, referenceUri, opts.refModel);

      const submitted = await falFetch<QueueSubmit>(`${QUEUE_BASE}/${plan.model}`, key, {
        method: "POST",
        body: JSON.stringify(plan.input),
      });
      if (!submitted.status_url || !submitted.response_url) {
        throw new Error(`fal queue submit for ${plan.model} returned no status/response URLs`);
      }

      const deadline = Date.now() + 5 * 60 * 1000;
      let status = await falFetch<QueueStatus>(submitted.status_url, key);
      while (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") {
        if (Date.now() > deadline) {
          throw new Error(`fal request ${submitted.request_id ?? ""} timed out after 5 minutes`);
        }
        await new Promise((r) => setTimeout(r, 1500));
        status = await falFetch<QueueStatus>(submitted.status_url, key);
      }
      if (status.status !== "COMPLETED") {
        throw new Error(
          `fal request ${submitted.request_id ?? ""} ended ${status.status ?? "without a status"}: ${JSON.stringify(status.error ?? "")}`,
        );
      }

      const output = await falFetch<FalOutput>(submitted.response_url, key);
      const url = output.images?.[0]?.url;
      if (!url) throw new Error(`fal request ${submitted.request_id ?? ""} completed but returned no image`);
      const imageRes = await fetch(url);
      if (!imageRes.ok) throw new Error(`Failed to download fal image (${imageRes.status})`);
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      if (!isPng(buffer)) {
        throw new Error(
          `fal model ${plan.model} returned non-PNG output despite output_format=png — ` +
            "pick a model that honors it (override FAL_DRAFT_MODEL / FAL_FINAL_MODEL)",
        );
      }
      return { buffer, seed: req.seed, modelId: plan.model };
    },
  };
}
