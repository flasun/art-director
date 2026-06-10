import { requireEnv } from "../config.js";
import { cropToAspect } from "../image.js";
import { fetchWithRetry } from "../net.js";
import type { GeneratedImage, GenerateRequest, ImageBackend } from "./types.js";

const API_BASE = "https://api.openai.com/v1";

const SIZES = [
  { size: "1024x1024", ratio: 1 },
  { size: "1024x1536", ratio: 1024 / 1536 },
  { size: "1536x1024", ratio: 1536 / 1024 },
] as const;

/** Nearest supported gpt-image size by log-ratio distance. */
export function gptImageSize(aspect: string): string {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  const target = Math.log(w / h);
  let best: (typeof SIZES)[number] = SIZES[0];
  let bestDistance = Infinity;
  for (const candidate of SIZES) {
    const distance = Math.abs(Math.log(candidate.ratio) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best.size;
}

interface ImagesResponse {
  data?: { b64_json?: string }[];
}

export function decodeImagesResponse(payload: ImagesResponse, context: string): Buffer {
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${context} returned no image data`);
  return Buffer.from(b64, "base64");
}

export function createGptImageBackend(opts: { model: string }): ImageBackend {
  return {
    id: "gpt-image",
    dialect:
      "OpenAI gpt-image, an instruction-following image model. Write clear, complete instructions " +
      "describing the finished image: subject, setting, lighting, palette (plain color words AND " +
      "hex codes), composition, and mood. It follows instructions literally and renders text well, " +
      "so explicitly forbid unwanted text or lettering. Negations are understood. Note: this model " +
      "has no seed control, so describe distinctive details you want kept stable. Keep it under 150 words.",

    async generate(req: GenerateRequest): Promise<GeneratedImage> {
      const key = requireEnv(
        "OPENAI_API_KEY",
        "Create a key at https://platform.openai.com/api-keys and put it in .env",
      );
      const size = gptImageSize(req.aspect);
      const quality = req.quality === "draft" ? "low" : "high";

      let res: Response;
      if (req.referenceImage) {
        // The edits endpoint is how gpt-image takes a conditioning image.
        const form = new FormData();
        form.append("model", opts.model);
        form.append("prompt", req.prompt);
        form.append("size", size);
        form.append("quality", quality);
        form.append("image", new Blob([new Uint8Array(req.referenceImage)], { type: "image/png" }), "reference.png");
        res = await fetchWithRetry(`${API_BASE}/images/edits`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        });
      } else {
        res = await fetchWithRetry(`${API_BASE}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: opts.model,
            prompt: req.prompt,
            n: 1,
            size,
            quality,
            output_format: "png",
          }),
        });
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI Images API ${res.status}: ${detail.slice(0, 500)}`);
      }
      const buffer = decodeImagesResponse((await res.json()) as ImagesResponse, "OpenAI Images API");

      // Fixed render sizes get center-cropped to the contracted aspect.
      // gpt-image has no seed parameter; req.seed is echoed for bookkeeping only.
      return { buffer: cropToAspect(buffer, req.aspect), seed: req.seed, modelId: opts.model };
    },
  };
}
