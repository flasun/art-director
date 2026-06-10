import type { Config } from "../config.js";
import { createGptImageBackend } from "./gptimage.js";
import { createReplicateBackend } from "./replicate.js";
import type { ImageBackend } from "./types.js";

export const BACKEND_IDS = ["replicate", "gpt-image"] as const;

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
    default:
      throw new Error(`Unknown backend "${config.backend}" — available: ${BACKEND_IDS.join(", ")}`);
  }
}
