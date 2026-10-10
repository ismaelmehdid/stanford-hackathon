import { createRun, executeRun } from "../src/lib/analysis/runs";
import {
  STAGE_LABELS,
  STAGES,
  type RunState,
} from "../src/lib/analysis/schema";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already exported in the shell.
}

const USAGE =
  "Usage: pnpm analyze <instagram-profile-url> [--brand-posts N] [--creators N] [--creator-posts N]";
const FLAGS = {
  "--brand-posts": "brandPostLimit",
  "--creators": "maxCreators",
  "--creator-posts": "creatorPostLimit",
} as const;

const [brandUrl, ...flags] = process.argv.slice(2);
if (!brandUrl) {
  console.error(USAGE);
  process.exit(1);
}
// Accepts "--flag N" and "--flag=N". Anything else is an error, so a typo never runs at the maximum caps.
const settings: Partial<Record<(typeof FLAGS)[keyof typeof FLAGS], string>> =
  {};
for (let index = 0; index < flags.length; index++) {
  const option = flags[index];
  const [name, inline] = option.split("=", 2);
  const key = FLAGS[name as keyof typeof FLAGS];
  const value = inline ?? flags[++index];
  if (!key || !value || !/^[1-9]\d*$/.test(value)) {
    console.error(
      `Invalid option or value at "${option}". Values are whole numbers of 1 or more.`,
    );
    console.error(USAGE);
    process.exit(1);
  }
  settings[key] = value;
}

const { run, created } = await createRun(brandUrl, settings);
if (!created) {
  console.error(
    `Run ${run.id} for @${run.brandUsername} is already in progress. Follow it at /analyze/${run.id}.`,
  );
  process.exit(1);
}
console.log(`Run ${run.id} for @${run.brandUsername}`, run.settings);

const printed = new Set<string>();
await executeRun(run, (state: RunState) => {
  for (const name of STAGES) {
    const { status, detail } = state.stages[name];
    const line = `${STAGE_LABELS[name]}: ${status}${detail ? ` (${detail})` : ""}`;
    if (status !== "pending" && !printed.has(line)) {
      printed.add(line);
      console.log(line);
    }
  }
});

console.log(
  `Status: ${run.status}${run.error ? ` (${run.error})` : ""}. Apify spend ≈ $${run.apifySpendUsd.toFixed(2)}`,
);
console.log(`Results: .data/runs/${run.id}/analysis.json`);
process.exit(run.status === "completed" ? 0 : 1);
