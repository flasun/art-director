import type { RoundRecord } from "./types.js";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface ProbePair {
  dimension: string;
  question: string;
  fileA: string;
  fileB: string;
}

/** Side-by-side A/B pairs for the visual creative interview. */
export function renderProbeSheet(pairs: ProbePair[]): string {
  const sections = pairs
    .map(
      (pair, i) => `<section>
  <h2>Pair ${i + 1} — ${escapeHtml(pair.dimension)}</h2>
  <p class="prompt">${escapeHtml(pair.question)}</p>
  <div class="pair">
    <figure class="card"><img src="${escapeHtml(pair.fileA)}" alt="A" loading="lazy" /><figcaption><strong>A</strong></figcaption></figure>
    <figure class="card"><img src="${escapeHtml(pair.fileB)}" alt="B" loading="lazy" /><figcaption><strong>B</strong></figcaption></figure>
  </div>
</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Creative interview probes</title>
<style>
  body { font-family: Georgia, serif; background: #181818; color: #EDEAE2; margin: 2rem auto; max-width: 900px; padding: 0 1rem; }
  h1 { font-weight: normal; font-style: italic; }
  h2 { border-bottom: 1px solid #3A3A3A; padding-bottom: .3rem; font-weight: normal; }
  .prompt { color: #B9B4A7; font-size: .95rem; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .card { margin: 0; background: #222; border-radius: 6px; overflow: hidden; }
  .card img { width: 100%; display: block; }
  figcaption { padding: .5rem .8rem; font-size: 1rem; }
</style>
</head>
<body>
<h1>Creative interview probes</h1>
<p class="prompt">Answer each question in the terminal with A or B — trust your gut.</p>
${sections}
</body>
</html>
`;
}

const VERDICT_COLORS: Record<string, string> = {
  ship: "#1B7F4B",
  revise: "#B07D1A",
  kill: "#A33232",
};

/**
 * Renders the annotated contact sheet as a single self-contained HTML file.
 * Image paths are relative to the shot directory the sheet lives in.
 */
export function renderContactSheet(
  shotDescription: string,
  rounds: RoundRecord[],
  finalFile: string | null,
): string {
  const roundSections = rounds
    .map((round) => {
      const cards = round.candidates
        .map((candidate) => {
          const critique = round.critique.critiques.find((c) => c.candidate === candidate.id);
          const verdict = critique?.verdict ?? "unrated";
          const color = VERDICT_COLORS[verdict] ?? "#666";
          const reasons = (critique?.reasons ?? [])
            .map((r) => `<li>${escapeHtml(r)}</li>`)
            .join("");
          const violations = (critique?.neverViolations ?? [])
            .map((v) => `<li class="violation">NEVER: ${escapeHtml(v)}</li>`)
            .join("");
          return `<figure class="card">
  <img src="${escapeHtml(candidate.file)}" alt="${escapeHtml(candidate.id)}" loading="lazy" />
  <figcaption>
    <span class="verdict" style="background:${color}">${escapeHtml(verdict)}</span>
    <strong>${escapeHtml(candidate.id)}</strong>
    <span class="meta">palette ${candidate.checks.palette.adherence}/100 · ${candidate.checks.tone.key} key · seed ${candidate.seed}</span>
    <ul>${reasons}${violations}</ul>
  </figcaption>
</figure>`;
        })
        .join("\n");
      const advice = round.critique.revisionAdvice
        ? `<p class="advice"><strong>Revision advice:</strong> ${escapeHtml(round.critique.revisionAdvice)}</p>`
        : "";
      return `<section>
  <h2>Round ${round.round}</h2>
  <p class="prompt">${escapeHtml(round.prompt)}</p>
  <div class="grid">${cards}</div>
  ${advice}
</section>`;
    })
    .join("\n");

  const finalSection = finalFile
    ? `<section><h2>Final</h2><figure class="card final"><img src="${escapeHtml(finalFile)}" alt="final" /></figure></section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Contact sheet — ${escapeHtml(shotDescription)}</title>
<style>
  body { font-family: Georgia, serif; background: #181818; color: #EDEAE2; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; }
  h1 { font-weight: normal; font-style: italic; }
  h2 { border-bottom: 1px solid #3A3A3A; padding-bottom: .3rem; font-weight: normal; }
  .prompt { color: #B9B4A7; font-size: .9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
  .card { margin: 0; background: #222; border-radius: 6px; overflow: hidden; }
  .card img { width: 100%; display: block; }
  figcaption { padding: .6rem .8rem; font-size: .82rem; }
  .verdict { color: #fff; border-radius: 3px; padding: .1rem .45rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; margin-right: .4rem; }
  .meta { color: #8E897D; display: block; margin-top: .2rem; }
  ul { padding-left: 1.1rem; margin: .4rem 0 0; color: #CFCABD; }
  .violation { color: #E07B7B; }
  .advice { color: #B9B4A7; font-size: .9rem; }
  .final img { max-width: 640px; }
</style>
</head>
<body>
<h1>Contact sheet — ${escapeHtml(shotDescription)}</h1>
${roundSections}
${finalSection}
</body>
</html>
`;
}
