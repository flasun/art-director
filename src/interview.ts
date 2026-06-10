import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import type { ImageBackend } from "./backends/types.js";
import { renderProbeSheet, type ProbePair } from "./contactsheet.js";
import { serializeContract } from "./contract.js";
import { draftDirection, generateInterview, type InterviewQuestions } from "./director.js";
import { readBrief, writeContract } from "./project.js";
import { readTasteProfile, recordTasteEvidence, tasteEnabled } from "./taste.js";

interface InterviewDeps {
  model: string;
  projectDir: string;
  log: (message: string) => void;
  /** When set, each forced choice is rendered as a pair of probe images. */
  backend?: ImageBackend;
  /** Skip reading and updating the cross-project taste profile. */
  noTaste?: boolean;
}

async function renderProbes(
  deps: InterviewDeps,
  backend: ImageBackend,
  questions: InterviewQuestions["questions"],
): Promise<string> {
  deps.log(`Rendering ${questions.length * 2} probe images (drafts — this costs a few cents)...`);
  fs.mkdirSync(path.join(deps.projectDir, "probes"), { recursive: true });

  const pairs: ProbePair[] = await Promise.all(
    questions.map(async (q, i) => {
      const render = async (option: string, suffix: "a" | "b") => {
        const image = await backend.generate({
          prompt: `${option}. Single cohesive image, no text or lettering.`,
          aspect: "1:1",
          seed: 1000 + i * 2 + (suffix === "b" ? 1 : 0),
          quality: "draft",
        });
        const file = path.join("probes", `q${i + 1}-${suffix}.png`);
        fs.writeFileSync(path.join(deps.projectDir, file), image.buffer);
        return file;
      };
      const [fileA, fileB] = await Promise.all([render(q.optionA, "a"), render(q.optionB, "b")]);
      return { dimension: q.dimension, question: q.question, fileA, fileB };
    }),
  );

  const sheetPath = path.join(deps.projectDir, "probes.html");
  fs.writeFileSync(sheetPath, renderProbeSheet(pairs));
  return sheetPath;
}

export async function runInterview(deps: InterviewDeps): Promise<string> {
  const brief = readBrief(deps.projectDir);

  const taste = !deps.noTaste && tasteEnabled() ? readTasteProfile() : null;
  if (taste) deps.log("Using your taste profile to sharpen the interview.");
  deps.log("Reading the brief and preparing the creative interview...");
  const { questions } = await generateInterview(deps.model, brief, taste);

  let probeSheet: string | null = null;
  if (deps.backend) {
    probeSheet = await renderProbes(deps, deps.backend, questions);
    deps.log(`Open ${probeSheet} to see each pair while you answer.\n`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const transcript: string[] = [];
  try {
    deps.log("\nAnswer with A or B (gut response — don't overthink). Add a note after a comma if you like.\n");
    for (const [i, q] of questions.entries()) {
      deps.log(`${i + 1}. [${q.dimension}] ${q.question}${probeSheet ? `  (pair ${i + 1} in probes.html)` : ""}`);
      deps.log(`   A) ${q.optionA}`);
      deps.log(`   B) ${q.optionB}`);
      let choice = "";
      while (!choice) {
        const raw = (await rl.question("   > ")).trim();
        const letter = raw.charAt(0).toUpperCase();
        if (letter === "A" || letter === "B") {
          const note = raw.slice(1).replace(/^[,\s]+/, "");
          choice = letter === "A" ? q.optionA : q.optionB;
          transcript.push(
            `Q (${q.dimension}): ${q.question}\nChose: ${choice}${note ? `\nNote: ${note}` : ""}`,
          );
        } else {
          deps.log("   Please answer A or B.");
        }
      }
    }
  } finally {
    rl.close();
  }

  deps.log("\nDrafting the Style Contract from your choices...");
  const contract = await draftDirection(deps.model, brief, transcript.join("\n\n"), taste);
  const directionPath = writeContract(deps.projectDir, serializeContract(contract));

  deps.log(`\n${contract.name} — ${contract.essence}`);
  deps.log(`Palette: ${contract.palette.map((c) => `${c.hex} ${c.name}`).join(", ")}`);
  deps.log(`Never: ${contract.never.join("; ")}`);

  if (!deps.noTaste) {
    await recordTasteEvidence(
      deps.model,
      `creative interview (project "${contract.name}")`,
      transcript.join("\n\n"),
      deps.log,
    );
  }
  return directionPath;
}
