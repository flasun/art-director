import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirrors the shape of the director's real schemas (nested arrays, enums,
// descriptions). Guards the zod <-> SDK contract: a zod major that the SDK
// helper can't consume fails here at build time, not mid-shoot with a key.
const RepresentativeSchema = z.object({
  critiques: z.array(
    z.object({
      candidate: z.string().describe("id"),
      verdict: z.enum(["ship", "revise", "kill"]),
      reasons: z.array(z.string()),
    }),
  ),
  ranking: z.array(z.string()),
  advice: z.string(),
});

describe("zodOutputFormat contract", () => {
  it("builds a JSON-schema output format from our schema style", () => {
    const format = zodOutputFormat(RepresentativeSchema);
    expect(format.type).toBe("json_schema");
    const schema = JSON.stringify(format.schema);
    expect(schema).toContain('"critiques"');
    // The SDK folds enum constraints into descriptions and enforces them
    // client-side, so the values appear escaped — assert presence, not form.
    expect(schema).toContain("ship");
  });

  it("round-trips a valid payload through the parser the SDK will use", () => {
    const payload = {
      critiques: [{ candidate: "r1-c1", verdict: "ship", reasons: ["on palette"] }],
      ranking: ["r1-c1"],
      advice: "",
    };
    expect(RepresentativeSchema.parse(payload)).toEqual(payload);
  });
});
