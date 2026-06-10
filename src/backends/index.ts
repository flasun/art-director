import type { Config } from "../config.js";
import { createComfyBackend } from "./comfyui.js";
import { createFalBackend } from "./fal.js";
import { createGptImageBackend } from "./gptimage.js";
import { createReplicateBackend } from "./replicate.js";
import type { ImageBackend } from "./types.js";

export const BACKEND_IDS = ["replicate", "gpt-image", "fal", "comfyui"] as const;

export function createBackend(config: Config): ImageBackend {
  switch (config.backend) {
    case "replicate":
      return createReplicateBackend({
        draftModel: config.draftModel,
        finalModel: config.finalModel,
        refDraftModel: config.refDraftModel,
      });
    case "gpt-image":
      return createGptImageBackend({ model: config.openaiImageModel });
    case "fal":
      return createFalBackend({
        draftModel: config.falDraftModel,
        finalModel: config.falFinalModel,
        refModel: config.falRefModel,
      });
    case "comfyui":
      return createComfyBackend({ url: config.comfyUrl, workflowPath: config.comfyWorkflow });
    default:
      throw new Error(`Unknown backend "${config.backend}" — available: ${BACKEND_IDS.join(", ")}`);
  }
}
