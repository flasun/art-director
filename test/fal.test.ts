import { describe, expect, it } from "vitest";
import { buildFalPlan } from "../src/backends/fal.js";

const REQ = { prompt: "a quiet kitchen", aspect: "4:5", seed: 42, quality: "draft" as const };
const REF_MODEL = "fal-ai/flux/dev/image-to-image";

describe("buildFalPlan", () => {
  it("builds explicit dimensions and png output without a reference", () => {
    const plan = buildFalPlan("fal-ai/flux/schnell", REQ, undefined, REF_MODEL);
    expect(plan.model).toBe("fal-ai/flux/schnell");
    expect(plan.input).toEqual({
      prompt: "a quiet kitchen",
      image_size: { width: 816, height: 1024 },
      seed: 42,
      num_images: 1,
      output_format: "png",
    });
  });

  it("swaps text-only models for the img2img model when a reference is present", () => {
    const plan = buildFalPlan("fal-ai/flux/schnell", REQ, "data:image/png;base64,AAA", REF_MODEL);
    expect(plan.model).toBe(REF_MODEL);
    expect(plan.input.image_url).toBe("data:image/png;base64,AAA");
    expect(plan.input.strength).toBe(0.85);
  });

  it("keeps a model that is already image-to-image", () => {
    const plan = buildFalPlan(REF_MODEL, REQ, "data:image/png;base64,AAA", "other/model");
    expect(plan.model).toBe(REF_MODEL);
  });
});
