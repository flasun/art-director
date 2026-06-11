import fs from "node:fs";
import { aspectDimensions, isPng } from "../image.js";
import { fetchWithRetry } from "../net.js";
import type { GeneratedImage, GenerateRequest, ImageBackend } from "./types.js";

/**
 * Drives a local ComfyUI server with a user-supplied workflow template
 * (API-format JSON, exported via "Save (API format)") containing the
 * placeholders {{PROMPT}}, {{SEED}}, {{WIDTH}}, {{HEIGHT}}. The user
 * owns the graph — checkpoints, samplers, and LoRAs are theirs; we own
 * what varies per shot.
 */
export function substituteWorkflow(
  template: string,
  vars: { prompt: string; seed: number; width: number; height: number },
): string {
  // The prompt lands inside a JSON string in the template — escape it as
  // JSON content (quotes, newlines) without the surrounding quotes.
  const jsonSafePrompt = JSON.stringify(vars.prompt).slice(1, -1);
  return template
    .replaceAll("{{PROMPT}}", jsonSafePrompt)
    .replaceAll("{{SEED}}", String(vars.seed))
    .replaceAll("{{WIDTH}}", String(vars.width))
    .replaceAll("{{HEIGHT}}", String(vars.height));
}

interface HistoryEntry {
  status?: { completed?: boolean; status_str?: string };
  outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[] }>;
}

export function firstOutputImage(entry: HistoryEntry): { filename: string; subfolder: string; type: string } | null {
  for (const node of Object.values(entry.outputs ?? {})) {
    const image = node.images?.[0];
    if (image) return { filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "output" };
  }
  return null;
}

export function createComfyBackend(opts: { url: string; workflowPath: string | null }): ImageBackend {
  return {
    id: "comfyui",
    dialect:
      "A local Stable Diffusion / SDXL pipeline via ComfyUI. Write a comma-separated tag-style " +
      "prompt: subject tags first, then style, lighting, palette as plain color words AND hex " +
      "codes, composition, quality tags. Dense keywords beat prose here. Keep it under 100 words.",

    async generate(req: GenerateRequest): Promise<GeneratedImage> {
      if (!opts.workflowPath) {
        throw new Error(
          "COMFYUI_WORKFLOW is not set. Export your graph with \"Save (API format)\", add the " +
            "{{PROMPT}}/{{SEED}}/{{WIDTH}}/{{HEIGHT}} placeholders, and point COMFYUI_WORKFLOW at it.",
        );
      }
      if (req.referenceImage) {
        throw new Error(
          "The comfyui backend doesn't support --ref yet — bake a LoadImage node into your workflow instead.",
        );
      }
      const template = fs.readFileSync(opts.workflowPath, "utf8");
      const { width, height } = aspectDimensions(req.aspect, 1024, 8);
      const workflow = JSON.parse(
        substituteWorkflow(template, { prompt: req.prompt, seed: req.seed, width, height }),
      ) as Record<string, unknown>;

      const submit = await fetchWithRetry(`${opts.url}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow }),
      });
      if (!submit.ok) {
        const detail = await submit.text().catch(() => "");
        throw new Error(`ComfyUI /prompt ${submit.status}: ${detail.slice(0, 500)}`);
      }
      const { prompt_id: promptId } = (await submit.json()) as { prompt_id?: string };
      if (!promptId) throw new Error("ComfyUI accepted the workflow but returned no prompt_id");

      // Local generation can be slow; poll generously.
      const deadline = Date.now() + 10 * 60 * 1000;
      let image: ReturnType<typeof firstOutputImage> = null;
      while (!image) {
        if (Date.now() > deadline) throw new Error(`ComfyUI prompt ${promptId} timed out after 10 minutes`);
        await new Promise((r) => setTimeout(r, 2000));
        // A blip while polling a 10-minute local render is not a failure.
        let historyRes: Response;
        try {
          historyRes = await fetchWithRetry(`${opts.url}/history/${promptId}`, undefined, {
            retries: 0,
            timeoutMs: 10_000,
          });
        } catch {
          continue;
        }
        if (!historyRes.ok) continue;
        const history = (await historyRes.json()) as Record<string, HistoryEntry>;
        const entry = history[promptId];
        if (!entry) continue;
        image = firstOutputImage(entry);
        if (!image && entry.status?.completed) {
          throw new Error(`ComfyUI prompt ${promptId} completed without image outputs — does the graph end in SaveImage?`);
        }
      }

      const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
      const viewRes = await fetchWithRetry(`${opts.url}/view?${params}`);
      if (!viewRes.ok) throw new Error(`ComfyUI /view ${viewRes.status} for ${image.filename}`);
      const buffer = Buffer.from(await viewRes.arrayBuffer());
      if (!isPng(buffer)) {
        throw new Error("ComfyUI returned non-PNG output — use a SaveImage node (not JPEG variants)");
      }
      return { buffer, seed: req.seed, modelId: `comfyui:${image.filename.split("_")[0] ?? "workflow"}` };
    },
  };
}
