import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJson, writeJson } from "@/lib/analysis/cache";
import {
  createGeneration,
  executeGeneration,
  generationDir,
  getGeneration,
  isValidGenerationId,
  isValidImageFile,
  listGenerations,
  pickTake,
  startGeneration,
} from "./generations";
import {
  checkPreviewAvailable,
  generateStoryboard,
  PreviewUnavailableError,
} from "./previews";
import type { GenerationState, Take, VideoScript } from "./schema";
import { generateScripts } from "./scripts";

// Keep the real (pure) slot planning and error class; only the paid OpenAI calls are mocked.
vi.mock("./scripts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scripts")>()),
  generateScripts: vi.fn(),
}));
vi.mock("./previews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./previews")>()),
  checkPreviewAvailable: vi.fn(),
  generateStoryboard: vi.fn(),
}));

const SOURCE = "sample:headandshoulders";
// A power of two, so summed costs compare exactly.
const FRAME_COST = 0.25;
const TAKE_COST = FRAME_COST * 3;
let tempDir: string;

const storyboardOf = (id: string): VideoScript["storyboard"] => [
  { label: "hook", atSecond: 1, imagePrompt: `Hook frame for ${id}` },
  { label: "product", atSecond: 4, imagePrompt: `Product frame for ${id}` },
  { label: "reveal", atSecond: 8, imagePrompt: `Reveal frame for ${id}` },
];

const fakeScripts = async (
  _analysis: unknown,
  slots: { briefIndex: number; hairstyle: string }[],
): Promise<VideoScript[]> =>
  slots.map((slot, index) => ({
    ...slot,
    id: `s${index + 1}`,
    title: `Script ${index + 1}`,
    format: "comparison",
    videoPrompt: `Prompt for s${index + 1}`,
    storyboard: storyboardOf(`s${index + 1}`),
    onScreenText: ["Scalp SOS"],
    voiceover: "Clean scalp first.",
    emotionalTriggers: ["humor"],
    rationale: "Keeps the hook.",
  }));

type StoryboardInput = Parameters<typeof generateStoryboard>[0];

// Renders instantly: writes fake JPEG bytes frame by frame and reports progress like the real client.
// failAtFrame makes the call throw after the frames before it were written.
async function fakeStoryboard(
  { frames, outDir, filePrefix, onFrame }: StoryboardInput,
  failAtFrame?: { index: number; error: Error },
) {
  const written: {
    label: (typeof frames)[number]["label"];
    atSecond: number;
    file: string;
  }[] = [];
  await mkdir(outDir, { recursive: true });
  for (const [index, frame] of frames.entries()) {
    if (failAtFrame?.index === index) throw failAtFrame.error;
    const file = `${filePrefix}-f${index + 1}.jpg`;
    await writeFile(path.join(outDir, file), "jpg");
    const preview = { label: frame.label, atSecond: frame.atSecond, file };
    written.push(preview);
    await onFrame?.(preview, FRAME_COST * (index + 1));
  }
  return { frames: written, costUsd: FRAME_COST * frames.length };
}

const finishedFrames = (prefix: string): Take["frames"] => [
  { label: "hook", atSecond: 1, file: `${prefix}-f1.jpg` },
  { label: "product", atSecond: 4, file: `${prefix}-f2.jpg` },
  { label: "reveal", atSecond: 8, file: `${prefix}-f3.jpg` },
];

const stateFile = (id: string) =>
  path.join(tempDir, "generations", id, "generation.json");
const readState = (id: string) => readJson<GenerationState>(stateFile(id));
const takeOf = (state: GenerationState, scriptId: string, index: number) =>
  state.scripts
    .find((entry) => entry.script.id === scriptId)
    ?.takes.find((take) => take.index === index);
const allTakes = (state: GenerationState) =>
  state.scripts.flatMap((entry) => entry.takes);

async function writeFrames(id: string, prefix: string, frames: number[]) {
  await mkdir(generationDir(id), { recursive: true });
  for (const frame of frames) {
    await writeFile(
      path.join(generationDir(id), `${prefix}-f${frame}.jpg`),
      "old",
    );
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "generations-"));
  vi.stubEnv("ANALYSIS_DATA_DIR", tempDir);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("PREVIEW_IMAGE_QUALITY", "");
  vi.mocked(generateScripts).mockImplementation(fakeScripts);
  vi.mocked(checkPreviewAvailable).mockResolvedValue();
  vi.mocked(generateStoryboard).mockImplementation((input) =>
    fakeStoryboard(input),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.mocked(generateScripts).mockReset();
  vi.mocked(checkPreviewAvailable).mockReset();
  vi.mocked(generateStoryboard).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe("validators", () => {
  it("rejects path traversal in generation ids and image file names", async () => {
    expect(isValidGenerationId("headandshoulders-20261010-014512")).toBe(true);
    expect(isValidGenerationId("headandshoulders-20261010-014512-2")).toBe(
      true,
    );
    for (const id of ["../secrets", "a/b", "..", "", "A B", "x".repeat(81)]) {
      expect(isValidGenerationId(id)).toBe(false);
    }
    expect(await getGeneration("../secrets")).toBeNull();
    expect(() => generationDir("../secrets")).toThrow();

    expect(isValidImageFile("s1-take1-f1.jpg")).toBe(true);
    expect(isValidImageFile("s123-take3-f3.jpg")).toBe(true);
    for (const file of [
      "../s1-take1-f1.jpg",
      "s1-take1-f1.jpg/..",
      "s1-take1-f0.jpg",
      "s1-take1-f4.jpg",
      "s1-take10-f1.jpg",
      "s1-take1-f1.jpg.tmp",
      "s1-take1-f1.jpeg",
      "s1-take1.mp4",
      "s1234-take1-f1.jpg",
      "generation.json",
      "..%2Fgeneration.json",
    ]) {
      expect(isValidImageFile(file)).toBe(false);
    }
  });
});

describe("createGeneration", () => {
  it("rejects a request over the 60 image cap before any OpenAI call", async () => {
    await expect(
      createGeneration({
        sourceId: SOURCE,
        briefIndexes: [0, 1, 2],
        settings: { hairstylesPerBrief: 5, takesPerScript: 3, seconds: 12 },
      }),
    ).rejects.toThrow(
      "This would create 135 images (≈ $4.73). The limit is 60.",
    );
    expect(generateScripts).not.toHaveBeenCalled();
    expect(checkPreviewAvailable).not.toHaveBeenCalled();
    expect(generateStoryboard).not.toHaveBeenCalled();
    await expect(stat(path.join(tempDir, "generations"))).rejects.toThrow();
  });

  it("checks the image model for free before the paid script call", async () => {
    const message =
      "Image previews are unavailable for this OpenAI key (404 The model does not exist.). Nothing was spent.";
    vi.mocked(checkPreviewAvailable).mockRejectedValueOnce(new Error(message));

    await expect(createGeneration({ sourceId: SOURCE })).rejects.toThrow(
      message,
    );
    expect(generateScripts).not.toHaveBeenCalled();
    expect(generateStoryboard).not.toHaveBeenCalled();
    expect(await listGenerations()).toEqual([]);

    await createGeneration({ sourceId: SOURCE });
    expect(checkPreviewAvailable).toHaveBeenCalledTimes(2);
  });

  it("accepts a request of exactly 60 images", async () => {
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [0, 1],
      settings: { hairstylesPerBrief: 5, takesPerScript: 2 },
    });
    expect(state.estimatedCostUsd).toBe(2.1);
  });

  it("estimates with the configured quality and rejects an unknown one", async () => {
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "high");
    const state = await createGeneration({ sourceId: SOURCE });
    expect(state.estimatedCostUsd).toBe(2.34);

    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "ultra");
    await expect(createGeneration({ sourceId: SOURCE })).rejects.toThrow(
      'PREVIEW_IMAGE_QUALITY "ultra" is not supported.',
    );
    expect(await listGenerations()).toHaveLength(1);
    expect(generateScripts).not.toHaveBeenCalled();
  });

  it("writes a queued generation with defaults for all briefs", async () => {
    const state = await createGeneration({ sourceId: SOURCE });
    expect(state).toMatchObject({
      sourceId: SOURCE,
      brand: "headandshoulders",
      briefIndexes: [0, 1, 2],
      settings: { hairstylesPerBrief: 1, takesPerScript: 2, seconds: 8 },
      status: "queued",
      stage: "scripts",
      error: null,
      estimatedCostUsd: 0.63,
      actualCostUsd: 0,
      scripts: [],
      picks: {},
    });
    expect(state.id).toMatch(/^headandshoulders-\d{8}-\d{6}$/);
    expect(await readState(state.id)).toEqual(state);
    expect(generateScripts).not.toHaveBeenCalled();
  });

  it("keeps only valid brief indexes and clamps settings", async () => {
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [2, 2, 7, -1, 1.5],
      settings: { hairstylesPerBrief: "x", takesPerScript: 99, seconds: 5 },
    });
    expect(state.briefIndexes).toEqual([2]);
    expect(state.settings).toEqual({
      hairstylesPerBrief: 1,
      takesPerScript: 3,
      seconds: 8,
    });
    expect(state.estimatedCostUsd).toBe(0.32);
  });

  it("gives generations created in the same second distinct ids", async () => {
    const [a, b] = await Promise.all([
      createGeneration({ sourceId: SOURCE }),
      createGeneration({ sourceId: SOURCE }),
    ]);
    expect(a.id).not.toBe(b.id);
    expect(isValidGenerationId(b.id)).toBe(true);
  });

  it("rejects unknown sources, empty selections and a missing key", async () => {
    await expect(createGeneration({ sourceId: "run:../x" })).rejects.toThrow(
      "Unknown source.",
    );
    await expect(
      createGeneration({ sourceId: SOURCE, briefIndexes: [] }),
    ).rejects.toThrow(/at least one/i);
    await expect(
      createGeneration({ sourceId: SOURCE, briefIndexes: [9] }),
    ).rejects.toThrow(/at least one/i);
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(createGeneration({ sourceId: SOURCE })).rejects.toThrow(
      "OPENAI_API_KEY is not set",
    );
  });
});

describe("executeGeneration", () => {
  it("renders every take; a failed take does not stop the others", async () => {
    vi.mocked(generateStoryboard).mockImplementation((input) =>
      fakeStoryboard(
        input,
        input.filePrefix === "s2-take2"
          ? {
              index: 1,
              error: new Error(
                "The image API returned no image for frame 2 (product).",
              ),
            }
          : undefined,
      ),
    );
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);

    const stored = await readState(state.id);
    expect(stored).toMatchObject({
      status: "completed",
      stage: "done",
      error: null,
    });
    expect(stored!.scripts.map((entry) => entry.script.id)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(generateStoryboard).toHaveBeenCalledTimes(6);
    expect(generateStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({
        frames: storyboardOf("s1"),
        outDir: generationDir(state.id),
        filePrefix: "s1-take1",
      }),
    );
    expect(takeOf(stored!, "s1", 1)).toEqual({
      index: 1,
      status: "completed",
      frames: finishedFrames("s1-take1"),
      costUsd: TAKE_COST,
      error: null,
    });
    // The frame rendered before the failure stays on disk and is paid for.
    expect(takeOf(stored!, "s2", 2)).toEqual({
      index: 2,
      status: "failed",
      frames: [
        { label: "hook", atSecond: 1, file: "s2-take2-f1.jpg" },
        { label: "product", atSecond: 4, file: null },
        { label: "reveal", atSecond: 8, file: null },
      ],
      costUsd: FRAME_COST,
      error: "The image API returned no image for frame 2 (product).",
    });
    const completed = allTakes(stored!).filter(
      (take) => take.status === "completed",
    );
    expect(completed).toHaveLength(5);
    expect(stored!.actualCostUsd).toBe(5 * TAKE_COST + FRAME_COST);
    expect(
      await readFile(
        path.join(generationDir(state.id), "s3-take2-f3.jpg"),
        "utf8",
      ),
    ).toBe("jpg");
  });

  it("fills take frames and the running cost as frames finish", async () => {
    const snapshots: GenerationState[] = [];
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [0],
      settings: { takesPerScript: 1 },
    });
    await executeGeneration(state, (snapshot) => snapshots.push(snapshot));

    const midway = snapshots.find((snapshot) => {
      const take = takeOf(snapshot, "s1", 1);
      return take?.status === "running" && take.frames[0].file !== null;
    });
    expect(takeOf(midway!, "s1", 1)).toEqual({
      index: 1,
      status: "running",
      frames: [
        { label: "hook", atSecond: 1, file: "s1-take1-f1.jpg" },
        { label: "product", atSecond: 4, file: null },
        { label: "reveal", atSecond: 8, file: null },
      ],
      costUsd: FRAME_COST,
      error: null,
    });
    expect(midway!.actualCostUsd).toBe(FRAME_COST);

    const pending = snapshots.find(
      (snapshot) => takeOf(snapshot, "s1", 1)?.status === "pending",
    );
    expect(takeOf(pending!, "s1", 1)).toEqual({
      index: 1,
      status: "pending",
      frames: [
        { label: "hook", atSecond: 1, file: null },
        { label: "product", atSecond: 4, file: null },
        { label: "reveal", atSecond: 8, file: null },
      ],
      costUsd: null,
      error: null,
    });
    expect((await readState(state.id))?.actualCostUsd).toBe(TAKE_COST);
  });

  it("renders at most two takes at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.mocked(generateStoryboard).mockImplementation(async (input) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await fakeStoryboard(input);
      } finally {
        inFlight--;
      }
    });
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);
    expect(generateStoryboard).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it("fails the job when no take renders, so a dead provider is not reported as completed", async () => {
    vi.mocked(generateStoryboard).mockRejectedValue(
      new Error("400 Your request was rejected by the safety system."),
    );
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);

    const stored = await readState(state.id);
    expect(stored).toMatchObject({
      status: "failed",
      stage: "videos",
      error:
        "No take rendered: 400 Your request was rejected by the safety system.",
      actualCostUsd: 0,
    });
    expect(generateStoryboard).toHaveBeenCalledTimes(6);
    expect(allTakes(stored!).map((take) => take.status)).toEqual(
      Array(6).fill("failed"),
    );
  });

  it("fails the generation fast once the image API refuses the key or model", async () => {
    const message =
      "Image previews are unavailable: 403 No access to gpt-image-2.";
    vi.mocked(generateStoryboard).mockImplementation(async (input) => {
      if (input.filePrefix === "s1-take1") return fakeStoryboard(input);
      throw new PreviewUnavailableError(message);
    });
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);

    const stored = await readState(state.id);
    // Only the takes already in flight (two at a time) reach the image API.
    expect(vi.mocked(generateStoryboard).mock.calls.length).toBeLessThanOrEqual(
      2,
    );
    expect(stored).toMatchObject({ status: "failed", error: message });
    // A take that finished before the refusal stays pickable.
    expect(takeOf(stored!, "s1", 1)).toMatchObject({
      status: "completed",
      frames: finishedFrames("s1-take1"),
    });
    for (const take of allTakes(stored!).filter(
      (item) => item !== takeOf(stored!, "s1", 1),
    )) {
      expect(take).toMatchObject({ status: "failed", error: message });
    }
  });

  it("fails the job when script generation fails", async () => {
    vi.mocked(generateScripts).mockRejectedValue(
      new Error("OpenAI returned 2 scripts for 3 slots."),
    );
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);
    expect(await readState(state.id)).toMatchObject({
      status: "failed",
      stage: "scripts",
      error: "OpenAI returned 2 scripts for 3 slots.",
      scripts: [],
    });
    expect(generateStoryboard).not.toHaveBeenCalled();
  });

  it("skips takes whose 3 frame files already exist and re-renders partial ones", async () => {
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [0],
    });
    await writeFrames(state.id, "s1-take1", [1, 2, 3]);
    await writeFrames(state.id, "s1-take2", [1]);
    await executeGeneration(state);

    expect(generateStoryboard).toHaveBeenCalledTimes(1);
    expect(generateStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({ filePrefix: "s1-take2" }),
    );
    const stored = await readState(state.id);
    expect(takeOf(stored!, "s1", 1)).toEqual({
      index: 1,
      status: "completed",
      frames: finishedFrames("s1-take1"),
      costUsd: null,
      error: null,
    });
    expect(takeOf(stored!, "s1", 2)).toMatchObject({
      status: "completed",
      frames: finishedFrames("s1-take2"),
      costUsd: TAKE_COST,
    });
    expect(stored!.actualCostUsd).toBe(TAKE_COST);
  });

  it("keeps the cost already spent when a generation resumes", async () => {
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [0],
    });
    const [script] = await fakeScripts(null, [
      { briefIndex: 0, hairstyle: "sleek low bun" },
    ]);
    await writeFrames(state.id, "s1-take1", [1, 2, 3]);
    await writeFrames(state.id, "s1-take2", [1]);
    const resumed: GenerationState = {
      ...state,
      actualCostUsd: TAKE_COST + FRAME_COST,
      scripts: [
        {
          script,
          takes: [
            {
              index: 1,
              status: "completed",
              frames: finishedFrames("s1-take1"),
              costUsd: TAKE_COST,
              error: null,
            },
            {
              index: 2,
              status: "failed",
              frames: [
                { label: "hook", atSecond: 1, file: "s1-take2-f1.jpg" },
                { label: "product", atSecond: 4, file: null },
                { label: "reveal", atSecond: 8, file: null },
              ],
              costUsd: FRAME_COST,
              error: "The image API returned no image for frame 2 (product).",
            },
          ],
        },
      ],
    };
    await executeGeneration(resumed);

    expect(generateScripts).not.toHaveBeenCalled();
    expect(generateStoryboard).toHaveBeenCalledTimes(1);
    const stored = await readState(state.id);
    expect(stored).toMatchObject({ status: "completed", error: null });
    expect(takeOf(stored!, "s1", 1)?.costUsd).toBe(TAKE_COST);
    expect(takeOf(stored!, "s1", 2)).toEqual({
      index: 2,
      status: "completed",
      frames: finishedFrames("s1-take2"),
      costUsd: FRAME_COST + TAKE_COST,
      error: null,
    });
    expect(stored!.actualCostUsd).toBe(2 * TAKE_COST + FRAME_COST);
  });
});

describe("liveness", () => {
  it("reports a generation left unfinished by a stopped server as failed", async () => {
    const state = await createGeneration({ sourceId: SOURCE });
    const stored = await getGeneration(state.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toBe(
      "The server stopped during this generation. Start a new one; finished takes are kept.",
    );
    expect((await listGenerations())[0].status).toBe("failed");
  });

  it("keeps finished takes viewable when the rendering process died", async () => {
    const state = await createGeneration({ sourceId: SOURCE });
    const [entry] = await fakeScripts(null, [
      { briefIndex: 0, hairstyle: "sleek low bun" },
    ]);
    const take = (index: number, status: "completed" | "running"): Take => ({
      index,
      status,
      frames:
        status === "completed"
          ? finishedFrames(`s1-take${index}`)
          : [
              { label: "hook", atSecond: 1, file: `s1-take${index}-f1.jpg` },
              { label: "product", atSecond: 4, file: null },
              { label: "reveal", atSecond: 8, file: null },
            ],
      costUsd: status === "completed" ? TAKE_COST : FRAME_COST,
      error: null,
    });
    await writeJson(stateFile(state.id), {
      ...state,
      status: "running",
      stage: "videos",
      pid: spawnSync("true").pid,
      scripts: [
        { script: entry, takes: [take(1, "completed"), take(2, "running")] },
      ],
    });

    const stored = await getGeneration(state.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toMatch(/server stopped/i);
    expect(takeOf(stored!, "s1", 1)).toMatchObject({
      status: "completed",
      frames: finishedFrames("s1-take1"),
    });
    expect(takeOf(stored!, "s1", 2)?.status).toBe("failed");
    // Finished takes can still be picked.
    expect((await pickTake(state.id, "s1", 1))?.picks).toEqual({ s1: 1 });
  });

  it("treats a generation another live, saving process runs as active", async () => {
    const state = await createGeneration({ sourceId: SOURCE });
    const file = stateFile(state.id);
    await writeJson(file, {
      ...state,
      status: "running",
      pid: process.ppid,
      updatedAt: new Date().toISOString(),
    });
    expect((await getGeneration(state.id))?.status).toBe("running");

    await writeJson(file, {
      ...state,
      status: "running",
      pid: process.ppid,
      updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect((await getGeneration(state.id))?.status).toBe("failed");
  });

  it("lists generations newest first and skips invalid folders", async () => {
    const older = await createGeneration({ sourceId: SOURCE });
    await writeJson(stateFile(older.id), {
      ...older,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = await createGeneration({ sourceId: SOURCE });
    await mkdir(path.join(tempDir, "generations", "Not Valid"));
    expect((await listGenerations()).map((state) => state.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });
});

describe("pickTake", () => {
  async function finishedGeneration() {
    vi.mocked(generateStoryboard).mockImplementation(async (input) => {
      if (input.filePrefix === "s1-take2")
        throw new Error("The image API returned no image for frame 1 (hook).");
      return fakeStoryboard(input);
    });
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);
    return state.id;
  }

  it("stores the picked take for a script", async () => {
    const id = await finishedGeneration();
    const picked = await pickTake(id, "s1", 1);
    expect(picked?.picks).toEqual({ s1: 1 });
    await pickTake(id, "s2", 2);
    expect((await readState(id))?.picks).toEqual({ s1: 1, s2: 2 });
  });

  it("rejects unknown scripts and unfinished takes without changing state", async () => {
    const id = await finishedGeneration();
    const before = await readFile(stateFile(id), "utf8");
    await expect(pickTake(id, "s9", 1)).rejects.toThrow("Unknown script.");
    await expect(pickTake(id, "s1", 2)).rejects.toThrow(/finished take/);
    await expect(pickTake(id, "s1", 7)).rejects.toThrow("Unknown take.");
    await expect(pickTake(id, "s1", "1" as unknown as number)).rejects.toThrow(
      "Unknown take.",
    );
    expect(await readFile(stateFile(id), "utf8")).toBe(before);
  });

  it("rejects a completed take that lacks any of its 3 frames", async () => {
    const id = await finishedGeneration();
    const state = (await readState(id))!;
    const [first, second] = state.scripts[1].takes;
    first.frames = first.frames.slice(0, 2);
    second.frames[2].file = null;
    await writeJson(stateFile(id), state);

    await expect(pickTake(id, "s2", 1)).rejects.toThrow(/finished take/);
    await expect(pickTake(id, "s2", 2)).rejects.toThrow(/finished take/);
    expect((await readState(id))?.picks).toEqual({});
  });

  it("returns null for a generation that does not exist", async () => {
    expect(await pickTake("missing-20261010-000000", "s1", 1)).toBeNull();
    expect(await pickTake("../secrets", "s1", 1)).toBeNull();
  });

  it("keeps a pick made while other takes are still rendering", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(generateStoryboard).mockImplementation(async (input) => {
      if (input.filePrefix === "s1-take2") await blocked;
      return fakeStoryboard(input);
    });
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [0],
    });
    startGeneration(state);
    expect((await getGeneration(state.id))?.status).toBe("running");

    await vi.waitFor(async () => {
      const current = await getGeneration(state.id);
      expect(takeOf(current!, "s1", 1)?.status).toBe("completed");
    });
    expect((await pickTake(state.id, "s1", 1))?.picks).toEqual({ s1: 1 });
    release();

    await vi.waitFor(async () => {
      expect((await readState(state.id))?.status).toBe("completed");
    });
    expect((await readState(state.id))?.picks).toEqual({ s1: 1 });
  });
});
