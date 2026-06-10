import type { RoundRecord } from "./types.js";

export function escapeHtml(text: string): string {
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

export interface CampaignSheetMember {
  id: string;
  file: string;
  outlier: boolean;
  issue?: string;
}

const SET_VERDICT_COLORS: Record<string, string> = {
  coherent: "#1B7F4B",
  drifting: "#B07D1A",
  broken: "#A33232",
};

/** Grid of campaign finals with the set-level judgement. */
export function renderCampaignSheet(
  campaignName: string,
  setVerdict: string,
  members: CampaignSheetMember[],
  details: { unifiers: string[]; advice: string },
): string {
  const cards = members
    .map(
      (m) => `<figure class="card${m.outlier ? " outlier" : ""}">
  <img src="${escapeHtml(m.file)}" alt="${escapeHtml(m.id)}" loading="lazy" />
  <figcaption>
    <strong>${escapeHtml(m.id)}</strong>
    ${m.outlier ? `<span class="badge">outlier</span>` : ""}
    ${m.issue ? `<p class="issue">${escapeHtml(m.issue)}</p>` : ""}
  </figcaption>
</figure>`,
    )
    .join("\n");
  const unifiers = details.unifiers.map((u) => `<li>${escapeHtml(u)}</li>`).join("");
  const verdictColor = SET_VERDICT_COLORS[setVerdict] ?? "#666";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Campaign — ${escapeHtml(campaignName)}</title>
<style>
  body { font-family: Georgia, serif; background: #181818; color: #EDEAE2; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; }
  h1 { font-weight: normal; font-style: italic; }
  .verdict { color: #fff; border-radius: 3px; padding: .15rem .55rem; text-transform: uppercase; letter-spacing: .05em; font-size: .85rem; background: ${verdictColor}; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
  .card { margin: 0; background: #222; border-radius: 6px; overflow: hidden; border: 2px solid transparent; }
  .card.outlier { border-color: #A33232; }
  .card img { width: 100%; display: block; }
  figcaption { padding: .6rem .8rem; font-size: .85rem; }
  .badge { background: #A33232; color: #fff; border-radius: 3px; padding: .05rem .4rem; font-size: .72rem; text-transform: uppercase; margin-left: .4rem; }
  .issue { color: #E07B7B; margin: .35rem 0 0; }
  ul { color: #CFCABD; }
  .advice { color: #B9B4A7; }
</style>
</head>
<body>
<h1>Campaign — ${escapeHtml(campaignName)}</h1>
<p>Set verdict: <span class="verdict">${escapeHtml(setVerdict)}</span></p>
${unifiers ? `<ul>${unifiers}</ul>` : ""}
${details.advice ? `<p class="advice"><strong>Advice:</strong> ${escapeHtml(details.advice)}</p>` : ""}
<div class="grid">${cards}</div>
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
