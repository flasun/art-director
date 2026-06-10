export interface UsageTally {
  claudeCalls: number;
  inputTokens: number;
  outputTokens: number;
  draftRenders: number;
  finalRenders: number;
}

export function emptyTally(): UsageTally {
  return { claudeCalls: 0, inputTokens: 0, outputTokens: 0, draftRenders: 0, finalRenders: 0 };
}

export function addClaudeUsage(
  tally: UsageTally,
  usage: { input_tokens: number; output_tokens: number },
): void {
  tally.claudeCalls += 1;
  tally.inputTokens += usage.input_tokens;
  tally.outputTokens += usage.output_tokens;
}

export function addRender(tally: UsageTally, quality: "draft" | "final"): void {
  if (quality === "draft") tally.draftRenders += 1;
  else tally.finalRenders += 1;
}

export function addTally(into: UsageTally, from: UsageTally): void {
  into.claudeCalls += from.claudeCalls;
  into.inputTokens += from.inputTokens;
  into.outputTokens += from.outputTokens;
  into.draftRenders += from.draftRenders;
  into.finalRenders += from.finalRenders;
}

export function renderUsage(tally: UsageTally): string {
  const tokens = `${tally.inputTokens.toLocaleString("en-US")} in / ${tally.outputTokens.toLocaleString("en-US")} out`;
  return `${tally.claudeCalls} director calls (${tokens} tokens), ${tally.draftRenders} draft + ${tally.finalRenders} final renders`;
}
