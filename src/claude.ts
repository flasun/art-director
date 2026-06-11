import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { requireEnv } from "./config.js";
import { addClaudeUsage, emptyTally, type UsageTally } from "./usage.js";

let client: Anthropic | null = null;
let tally: UsageTally = emptyTally();

export function resetClaudeUsage(): void {
  tally = emptyTally();
}

/** Token spend accumulated by director calls since the last reset. */
export function getClaudeUsage(): UsageTally {
  return { ...tally };
}

function getClient(): Anthropic {
  if (!client) {
    requireEnv("ANTHROPIC_API_KEY", "Create a key at https://platform.claude.com and put it in .env");
    client = new Anthropic();
  }
  return client;
}

export type ContentBlock = Anthropic.ContentBlockParam;

export function textBlock(text: string): ContentBlock {
  return { type: "text", text };
}

export function imageBlock(png: Buffer): ContentBlock {
  return {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
  };
}

/**
 * One structured director call: system prompt + content blocks in,
 * schema-validated object out. A response that misses the schema is
 * retried once before failing — these calls sit between paid renders.
 */
export async function directorCall<Schema extends z.ZodType>(opts: {
  model: string;
  system: string;
  content: ContentBlock[];
  schema: Schema;
  schemaName: string;
}): Promise<z.infer<Schema>> {
  const attempt = async () => {
    const response = await getClient().messages.parse({
      model: opts.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      output_config: { format: zodOutputFormat(opts.schema) },
    });
    addClaudeUsage(tally, response.usage);
    return response;
  };

  let response = await attempt();
  if (response.parsed_output == null) {
    response = await attempt();
  }
  if (response.parsed_output == null) {
    throw new Error(
      `Director response for ${opts.schemaName} did not match the expected schema after a retry ` +
        `(stop_reason: ${response.stop_reason ?? "unknown"})`,
    );
  }
  return response.parsed_output;
}
