import { describe, expect, it } from "vitest";
import { buildPredictionInput, referenceBinding } from "../src/backends/replicate.js";

const REQ = { prompt: "a quiet kitchen", aspect: "4:5", seed: 42, quality: "draft" as const };

describe("referenceBinding", () => {
  it("maps each flux family to its image input field", () => {
    expect(referenceBinding("black-forest-labs/flux-schnell")).toBeNull();
    expect(referenceBinding("black-forest-labs/flux-kontext-pro")).toEqual({ field: "input_image" });
    expect(referenceBinding("black-forest-labs/flux-dev")).toEqual({
      field: "image",
      extra: { prompt_strength: 0.8 },
    });
    expect(referenceBinding("black-forest-labs/flux-1.1-pro")).toEqual({ field: "image_prompt" });
    expect(referenceBinding("some/other-model")).toEqual({ field: "image_prompt" });
  });
});

describe("buildPredictionInput", () => {
  it("builds the base input without a reference", () => {
    expect(buildPredictionInput("black-forest-labs/flux-schnell", REQ)).toEqual({
      prompt: "a quiet kitchen",
      aspect_ratio: "4:5",
      output_format: "png",
      seed: 42,
    });
  });

  it("attaches the reference under the model's field", () => {
    const input = buildPredictionInput("black-forest-labs/flux-1.1-pro", REQ, "data:image/png;base64,AAA");
    expect(input.image_prompt).toBe("data:image/png;base64,AAA");
  });

  it("adds prompt_strength for img2img models", () => {
    const input = buildPredictionInput("black-forest-labs/flux-dev", REQ, "data:image/png;base64,AAA");
    expect(input.image).toBe("data:image/png;base64,AAA");
    expect(input.prompt_strength).toBe(0.8);
  });

  it("drops the reference for models that cannot take one", () => {
    const input = buildPredictionInput("black-forest-labs/flux-schnell", REQ, "data:image/png;base64,AAA");
    expect(input).not.toHaveProperty("image");
    expect(input).not.toHaveProperty("image_prompt");
  });
});
