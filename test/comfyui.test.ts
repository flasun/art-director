import { describe, expect, it } from "vitest";
import { firstOutputImage, substituteWorkflow } from "../src/backends/comfyui.js";

const TEMPLATE = `{
  "3": { "inputs": { "seed": {{SEED}}, "width": {{WIDTH}}, "height": {{HEIGHT}} } },
  "6": { "inputs": { "text": "{{PROMPT}}" } }
}`;

describe("substituteWorkflow", () => {
  it("substitutes all placeholders into parseable JSON", () => {
    const result = substituteWorkflow(TEMPLATE, { prompt: "warm kitchen", seed: 7, width: 816, height: 1024 });
    const parsed = JSON.parse(result) as Record<string, { inputs: Record<string, unknown> }>;
    expect(parsed["3"]!.inputs).toEqual({ seed: 7, width: 816, height: 1024 });
    expect(parsed["6"]!.inputs.text).toBe("warm kitchen");
  });

  it("escapes prompts containing quotes and newlines as JSON content", () => {
    const result = substituteWorkflow(TEMPLATE, {
      prompt: 'say "hi"\nwith a newline',
      seed: 1,
      width: 8,
      height: 8,
    });
    const parsed = JSON.parse(result) as Record<string, { inputs: Record<string, unknown> }>;
    expect(parsed["6"]!.inputs.text).toBe('say "hi"\nwith a newline');
  });
});

describe("firstOutputImage", () => {
  it("finds the first image across output nodes with defaults", () => {
    expect(
      firstOutputImage({ outputs: { "9": { images: [{ filename: "ComfyUI_0001.png" }] } } }),
    ).toEqual({ filename: "ComfyUI_0001.png", subfolder: "", type: "output" });
  });

  it("returns null when no node produced images", () => {
    expect(firstOutputImage({ outputs: { "9": { images: [] } } })).toBeNull();
    expect(firstOutputImage({})).toBeNull();
  });
});
