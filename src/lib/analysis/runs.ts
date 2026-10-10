import { readdir } from "node:fs/promises";
import path from "node:path";
import { dataDir, paths, readJson, writeJson } from "./cache";
import { clampSettings, requireEnv, type RunSettings } from "./config";
import { isPresent, parseInstagramUsername } from "./instagram";
import { runPipeline } from "./pipeline";
import { STAGES, type BrandAnalysis, type RunState } from "./schema";

const RUN_ID_PATTERN = /^[a-z0-9._-]{1,80}$/;
// A running run saves at least this often, so other processes can tell it is alive.
const HEARTBEAT_MS = 30_000;

// Kept on globalThis so Next.js dev hot reloads do not forget running jobs.
const globalRuns = globalThis as typeof globalThis & {
  __analysisRuns?: Map<string, Promise<void>>;
};
const activeRuns = (globalRuns.__analysisRuns ??= new Map<
  string,
  Promise<void>
>());

const runFile = (runId: string) => path.join(paths.run(runId), "run.json");
const analysisFile = (runId: string) =>
  path.join(paths.run(runId), "analysis.json");

export const isValidRunId = (runId: string) =>
  RUN_ID_PATTERN.test(runId) && !runId.includes("..");

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Runs started by another process (the CLI, or another server) live while that process exists and keeps saving.
function isActive(run: RunState) {
  if (activeRuns.has(run.id)) return true;
  if (run.status !== "queued" && run.status !== "running") return false;
  if (!run.pid || run.pid === process.pid) return false;
  return (
    isProcessAlive(run.pid) &&
    Date.now() - Date.parse(run.updatedAt) < 3 * HEARTBEAT_MS
  );
}

// A run that no live process is executing can never finish; report it as failed.
function markIfAbandoned(run: RunState): RunState {
  if ((run.status === "queued" || run.status === "running") && !isActive(run)) {
    return {
      ...run,
      status: "failed",
      error:
        run.error ??
        "The server stopped during this run. Start a new run for this brand; finished steps are reused from the cache.",
    };
  }
  return run;
}

export async function listRuns(): Promise<RunState[]> {
  const ids = await readdir(path.join(dataDir(), "runs")).catch(
    () => [] as string[],
  );
  const runs = await Promise.all(
    ids.filter(isValidRunId).map((id) => readJson<RunState>(runFile(id))),
  );
  return runs
    .filter(isPresent)
    .map(markIfAbandoned)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRun(
  runId: string,
): Promise<{ run: RunState; analysis: BrandAnalysis | null } | null> {
  if (!isValidRunId(runId)) return null;
  const run = await readJson<RunState>(runFile(runId));
  if (!run) return null;
  const analysis =
    run.status === "completed"
      ? await readJson<BrandAnalysis>(analysisFile(runId))
      : null;
  return { run: markIfAbandoned(run), analysis };
}

export async function createRun(
  brandUrl: string,
  settings: Partial<Record<keyof RunSettings, unknown>> = {},
): Promise<{ run: RunState; created: boolean }> {
  const brandUsername = parseInstagramUsername(brandUrl);
  if (!brandUsername)
    throw new Error("Enter a valid Instagram profile URL or username.");
  requireEnv("APIFY_TOKEN");
  requireEnv("OPENAI_API_KEY");

  const running = (await listRuns()).find(
    (run) => run.brandUsername === brandUsername && isActive(run),
  );
  if (running) return { run: running, created: false };

  const now = new Date().toISOString();
  const stamp = now.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const run: RunState = {
    id: `${brandUsername}-${stamp}`,
    brandUsername,
    brandUrl: `https://www.instagram.com/${brandUsername}/`,
    settings: clampSettings(settings),
    status: "queued",
    pid: process.pid,
    createdAt: now,
    updatedAt: now,
    error: null,
    stages: Object.fromEntries(
      STAGES.map((name) => [name, { status: "pending", detail: null }]),
    ) as RunState["stages"],
    videos: [],
    apifySpendUsd: 0,
  };
  await writeJson(runFile(run.id), run);
  return { run, created: true };
}

export async function executeRun(
  run: RunState,
  onProgress?: (run: RunState) => void,
): Promise<void> {
  let writes: Promise<void> = Promise.resolve();
  // Serialize writes so a slow earlier write never overwrites a newer state.
  const persist = () => {
    run.updatedAt = new Date().toISOString();
    const snapshot = structuredClone(run);
    onProgress?.(snapshot);
    writes = writes.then(() => writeJson(runFile(run.id), snapshot));
    return writes;
  };

  run.pid = process.pid;
  run.status = "running";
  await persist();
  // Long scrapes save nothing for minutes; keep updatedAt fresh so the run does not read as abandoned.
  const heartbeat = setInterval(
    () => void persist().catch(() => {}),
    HEARTBEAT_MS,
  );
  heartbeat.unref();
  try {
    const analysis = await runPipeline(run, persist);
    await writeJson(analysisFile(run.id), analysis);
    run.status = "completed";
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
    console.error(`Analysis run ${run.id} failed`, error);
  } finally {
    clearInterval(heartbeat);
  }
  await persist();
}

export function startRun(run: RunState) {
  const job = executeRun(run).finally(() => activeRuns.delete(run.id));
  activeRuns.set(run.id, job);
}
