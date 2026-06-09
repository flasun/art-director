import readline from "node:readline/promises";
import { serializeContract } from "./contract.js";
import { draftDirection, generateInterview } from "./director.js";
import { readBrief, writeContract } from "./project.js";

interface InterviewDeps {
  model: string;
  projectDir: string;
  log: (message: string) => void;
}

export async function runInterview(deps: InterviewDeps): Promise<string> {
  const brief = readBrief(deps.projectDir);

  deps.log("Reading the brief and preparing the creative interview...");
  const { questions } = await generateInterview(deps.model, brief);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const transcript: string[] = [];
  try {
    deps.log("\nAnswer with A or B (gut response — don't overthink). Add a note after a comma if you like.\n");
    for (const [i, q] of questions.entries()) {
      deps.log(`${i + 1}. [${q.dimension}] ${q.question}`);
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
  const contract = await draftDirection(deps.model, brief, transcript.join("\n\n"));
  const directionPath = writeContract(deps.projectDir, serializeContract(contract));

  deps.log(`\n${contract.name} — ${contract.essence}`);
  deps.log(`Palette: ${contract.palette.map((c) => `${c.hex} ${c.name}`).join(", ")}`);
  deps.log(`Never: ${contract.never.join("; ")}`);
  return directionPath;
}
