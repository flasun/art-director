export interface GenerateRequest {
  prompt: string;
  /** e.g. "4:5" */
  aspect: string;
  seed: number;
  quality: "draft" | "final";
  /** PNG to anchor the subject/style via image conditioning, where supported. */
  referenceImage?: Buffer;
}

export interface GeneratedImage {
  buffer: Buffer;
  seed: number;
  modelId: string;
}

/**
 * One render of one image. Callers fan out with Promise.all and distinct
 * seeds — keeping the interface uniform across models that do and don't
 * support batch outputs.
 */
export interface ImageBackend {
  id: string;
  /**
   * Prompt-dialect guidance handed to the director when compiling the
   * Style Contract into a prompt for this backend.
   */
  dialect: string;
  generate(req: GenerateRequest): Promise<GeneratedImage>;
}
