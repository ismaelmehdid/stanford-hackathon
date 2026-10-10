import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { dataDir, readJson, writeJson } from "@/lib/analysis/cache";
import { requireEnv } from "@/lib/analysis/config";
import { isPresent } from "@/lib/analysis/instagram";
import { mapWithConcurrency } from "@/lib/analysis/pipeline";
import {
  clampGenerationSettings,
  estimateSoraCostUsd,
  GENERATION_LIMITS,
  totalVideoSeconds,
  type GenerationSettings,
} from "./config";
import type { GenerationState, ScriptEntry, Take } from "./schema";
import { generateScripts, planScriptSlots } from "./scripts";
import { checkSoraAvailable, generateTake, SoraUnavailableError } from "./sora";
import { loadAnalysis } from "./sources";

const GENERATION_ID_PATTERN = /^[a-z0-9._-]{1,80}$/;
const VIDEO_FILE_PATTERN = /^s\d{1,3}-take\d\.mp4$/;
// A running generation saves at least this often, so other processes can tell it is alive.
const HEARTBEAT_MS = 30_000;
// Sora renders run in parallel up to this many at a time per generation.
const TAKE_CONCURRENCY = 2;
const ABANDONED_ERROR =
  "The server stopped during this generation. Start a new one; finished takes are kept.";
const ABANDONED_TAKE_ERROR = "The server stopped before this take finished.";

type LiveGeneration = { state: GenerationState; persist: () => Promise<void> };

// Kept on globalThis so Next.js dev hot reloads do not forget running jobs.
// Holds the live state so picks made during rendering update it instead of being overwritten.
const globalGenerations = globalThis as typeof globalThis & {
  __generations?: Map<string, LiveGeneration>;
};
const activeGenerations = (globalGenerations.__generations ??= new Map<
  string,
  LiveGeneration
>());

export const isValidGenerationId = (id: string) =>
  typeof id === "string" &&
  GENERATION_ID_PATTERN.test(id) &&
  !id.includes("..");

export const isValidVideoFile = (file: string) =>
  typeof file === "string" && VIDEO_FILE_PATTERN.test(file);

const generationsRoot = () => path.join(dataDir(), "generations");

export function generationDir(id: string) {
  if (!isValidGenerationId(id)) throw new Error("Invalid generation id.");
  return path.join(generationsRoot(), id);
}

const stateFile = (id: string) =>
  path.join(generationDir(id), "generation.json");
const takeFile = (scriptId: string, take: Take) =>
  `${scriptId}-take${take.index}.mp4`;
// Typed partial update, so a misspelled status or field fails the typecheck.
const updateTake = (take: Take, changes: Partial<Take>) =>
  Object.assign(take, changes);
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Generations started by another process live while that process exists and keeps saving.
function isActive(state: GenerationState) {
  if (activeGenerations.has(state.id)) return true;
  if (state.status !== "queued" && state.status !== "running") return false;
  if (!state.pid || state.pid === process.pid) return false;
  return (
    isProcessAlive(state.pid) &&
    Date.now() - Date.parse(state.updatedAt) < 3 * HEARTBEAT_MS
  );
}

// A generation no live process is executing can never finish; report it and its unfinished takes as failed.
function markIfAbandoned(state: GenerationState): GenerationState {
  if (
    (state.status !== "queued" && state.status !== "running") ||
    isActive(state)
  )
    return state;
  return {
    ...state,
    status: "failed",
    error: state.error ?? ABANDONED_ERROR,
    scripts: state.scripts.map((entry) => ({
      ...entry,
      takes: entry.takes.map((take) =>
        take.status === "pending" || take.status === "running"
          ? {
              ...take,
              status: "failed",
              error: take.error ?? ABANDONED_TAKE_ERROR,
            }
          : take,
      ),
    })),
  };
}

async function readState(id: string): Promise<GenerationState | null> {
  if (!isValidGenerationId(id)) return null;
  return readJson<GenerationState>(stateFile(id));
}

export async function getGeneration(
  id: string,
): Promise<GenerationState | null> {
  const live = activeGenerations.get(id);
  if (live) return structuredClone(live.state);
  const state = await readState(id);
  return state ? markIfAbandoned(state) : null;
}

export async function listGenerations(): Promise<GenerationState[]> {
  const ids = await readdir(generationsRoot()).catch(() => [] as string[]);
  const states = await Promise.all(
    ids.filter(isValidGenerationId).map((id) =>
      getGeneration(id).catch((error: unknown) => {
        console.error(`Generation ${id} could not be read`, error);
        return null;
      }),
    ),
  );
  return states
    .filter(isPresent)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const idPrefix = (brand: string) =>
  brand
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .slice(0, 60) || "brand";

// Claims a fresh folder atomically, so two generations started in the same second never share one.
async function claimGenerationId(base: string): Promise<string> {
  await mkdir(generationsRoot(), { recursive: true });
  for (let attempt = 1; attempt <= 100; attempt++) {
    const id = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      await mkdir(generationDir(id));
      return id;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not allocate a generation id. Try again.");
}

export async function createGeneration(input: {
  sourceId: string;
  briefIndexes?: number[] | null;
  settings?: Partial<Record<keyof GenerationSettings, unknown>> | null;
}): Promise<GenerationState> {
  requireEnv("OPENAI_API_KEY");
  if (typeof input.sourceId !== "string") throw new Error("Unknown source.");
  const analysis = await loadAnalysis(input.sourceId);
  const briefCount = analysis.conclusions?.replicationBriefs.length ?? 0;
  const requested = Array.isArray(input.briefIndexes)
    ? input.briefIndexes
    : Array.from({ length: briefCount }, (_, index) => index);
  const settings = clampGenerationSettings(input.settings ?? {});
  const slots = planScriptSlots(
    analysis,
    requested,
    settings.hairstylesPerBrief,
  );
  if (slots.length === 0)
    throw new Error("Select at least one brief with a hairstyle variation.");

  // Reject over-cap requests here, before any paid OpenAI or Sora call.
  // The estimate also rejects a SORA_MODEL with no known price.
  const estimatedCostUsd = estimateSoraCostUsd(slots.length, settings);
  const seconds = totalVideoSeconds(slots.length, settings);
  if (seconds > GENERATION_LIMITS.totalSeconds) {
    throw new Error(
      `This would render ${seconds} s of video (≈ $${estimatedCostUsd.toFixed(2)}). The limit is ${GENERATION_LIMITS.totalSeconds} s.`,
    );
  }
  // A free call, so a retired or inaccessible Sora API fails here instead of after the paid script call.
  await checkSoraAvailable();

  const now = new Date().toISOString();
  const stamp = now.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const brand = analysis.brand.username;
  const state: GenerationState = {
    id: await claimGenerationId(`${idPrefix(brand)}-${stamp}`),
    sourceId: input.sourceId,
    brand,
    briefIndexes: [...new Set(slots.map((slot) => slot.briefIndex))],
    settings,
    status: "queued",
    stage: "scripts",
    createdAt: now,
    updatedAt: now,
    error: null,
    pid: process.pid,
    estimatedCostUsd,
    scripts: [],
    picks: {},
  };
  await writeJson(stateFile(state.id), state);
  return state;
}

async function fileExists(file: string) {
  return stat(file).then(
    (info) => info.isFile() && info.size > 0,
    () => false,
  );
}

const pendingTake = (index: number): Take => ({
  index,
  status: "pending",
  soraVideoId: null,
  file: null,
  error: null,
});

export async function executeGeneration(
  state: GenerationState,
  onProgress?: (state: GenerationState) => void,
): Promise<void> {
  let writes: Promise<void> = Promise.resolve();
  // Serialize writes so a slow earlier write never overwrites a newer state,
  // and chain on the settled previous write so one failed write does not block every later one.
  const persist = () => {
    state.updatedAt = new Date().toISOString();
    const snapshot = structuredClone(state);
    onProgress?.(snapshot);
    const write = writes
      .catch(() => {})
      .then(() => writeJson(stateFile(state.id), snapshot));
    writes = write;
    return write;
  };
  // Progress saves during rendering must not abort the other takes; the final save reports failures.
  const saveProgress = () =>
    persist().catch((error: unknown) =>
      console.error(`Generation ${state.id} could not be saved`, error),
    );

  activeGenerations.set(state.id, { state, persist });
  state.pid = process.pid;
  state.status = "running";
  state.error = null;
  // Sora renders save nothing for minutes; keep updatedAt fresh so the job does not read as abandoned.
  const heartbeat = setInterval(() => void saveProgress(), HEARTBEAT_MS);
  heartbeat.unref();
  try {
    await persist();
    if (state.scripts.length === 0) {
      state.stage = "scripts";
      await persist();
      const analysis = await loadAnalysis(state.sourceId);
      const slots = planScriptSlots(
        analysis,
        state.briefIndexes,
        state.settings.hairstylesPerBrief,
      );
      const scripts = await generateScripts(
        analysis,
        slots,
        state.settings.seconds,
      );
      state.scripts = scripts.map((script): ScriptEntry => ({
        script,
        takes: Array.from({ length: state.settings.takesPerScript }, (_, i) =>
          pendingTake(i + 1),
        ),
      }));
    }

    state.stage = "videos";
    await persist();
    const dir = generationDir(state.id);
    // Take 1 of every script first, so an interrupted job still has a take for each script.
    const jobs = state.scripts
      .flatMap((entry) => entry.takes.map((take) => ({ entry, take })))
      .sort((a, b) => a.take.index - b.take.index);
    // Once Sora refuses the key or model, every later take would fail the same way; do not start them.
    let unavailable: string | null = null;
    await mapWithConcurrency(
      jobs,
      TAKE_CONCURRENCY,
      async ({ entry, take }) => {
        const file = takeFile(entry.script.id, take);
        const outPath = path.join(dir, file);
        if (await fileExists(outPath)) {
          updateTake(take, { status: "completed", file, error: null });
          await saveProgress();
          return;
        }
        if (unavailable) {
          updateTake(take, { status: "failed", error: unavailable });
          await saveProgress();
          return;
        }
        updateTake(take, { status: "running", file: null, error: null });
        await saveProgress();
        try {
          await generateTake({
            prompt: entry.script.soraPrompt,
            seconds: state.settings.seconds,
            outPath,
            onStarted: (videoId) => {
              take.soraVideoId = videoId;
              void saveProgress();
            },
          });
          updateTake(take, { status: "completed", file });
        } catch (error) {
          if (error instanceof SoraUnavailableError)
            unavailable ??= errorMessage(error);
          updateTake(take, { status: "failed", error: errorMessage(error) });
          console.error(
            `Generation ${state.id} take ${file} failed`,
            errorMessage(error),
          );
        }
        await saveProgress();
      },
    );
    // A generation with nothing to pick is a failure, so a dead provider never reads as completed.
    const takes = state.scripts.flatMap((entry) => entry.takes);
    if (!takes.some((take) => take.status === "completed")) {
      const firstError = takes.find((take) => take.error)?.error;
      throw new Error(
        firstError ? `No take rendered: ${firstError}` : "No take rendered.",
      );
    }
    state.stage = "done";
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.error = errorMessage(error);
    console.error(`Generation ${state.id} failed`, error);
  } finally {
    clearInterval(heartbeat);
  }
  try {
    await persist();
  } finally {
    activeGenerations.delete(state.id);
  }
}

export function startGeneration(state: GenerationState) {
  void executeGeneration(state).catch((error: unknown) =>
    console.error(`Generation ${state.id} could not be saved`, error),
  );
}

// Picks run one at a time, so two quick picks never read the same file and drop each other.
let pickQueue: Promise<unknown> = Promise.resolve();

/**
 * Records `takeIndex` as the chosen take for `scriptId`. Returns null when the
 * generation does not exist; throws when the script is unknown or the take is not finished.
 */
export function pickTake(
  id: string,
  scriptId: string,
  takeIndex: number,
): Promise<GenerationState | null> {
  const pick = pickQueue.then(async () => {
    const live = activeGenerations.get(id);
    const state = live ? live.state : await readState(id);
    if (!state) return null;
    const entry = state.scripts.find((item) => item.script.id === scriptId);
    if (!entry) throw new Error("Unknown script.");
    const take = entry.takes.find((item) => item.index === takeIndex);
    if (!take) throw new Error("Unknown take.");
    if (take.status !== "completed" || !take.file)
      throw new Error("Only a finished take can be picked.");

    state.picks = { ...state.picks, [scriptId]: takeIndex };
    if (live) {
      await live.persist();
      return structuredClone(live.state);
    }
    await writeJson(stateFile(id), state);
    return markIfAbandoned(state);
  });
  pickQueue = pick.catch(() => {});
  return pick;
}
