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
  isValidVideoFile,
  listGenerations,
  pickTake,
  startGeneration,
} from "./generations";
import type { GenerationState, VideoScript } from "./schema";
import { generateScripts } from "./scripts";
import { checkSoraAvailable, generateTake, SoraUnavailableError } from "./sora";

// Keep the real (pure) slot planning; only the paid OpenAI and Sora calls are mocked.
vi.mock("./scripts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scripts")>()),
  generateScripts: vi.fn(),
}));
vi.mock("./sora", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sora")>()),
  checkSoraAvailable: vi.fn(),
  generateTake: vi.fn(),
}));

const SOURCE = "sample:headandshoulders";
let tempDir: string;

const fakeScripts = async (
  _analysis: unknown,
  slots: { briefIndex: number; hairstyle: string }[],
): Promise<VideoScript[]> =>
  slots.map((slot, index) => ({
    ...slot,
    id: `s${index + 1}`,
    title: `Script ${index + 1}`,
    format: "comparison",
    soraPrompt: `Prompt for s${index + 1}`,
    onScreenText: ["Scalp SOS"],
    voiceover: "Clean scalp first.",
    emotionalTriggers: ["humor"],
    rationale: "Keeps the hook.",
  }));

type TakeInput = Parameters<typeof generateTake>[0];

// Renders instantly: reports the Sora id, then writes fake MP4 bytes like the real client.
async function fakeTake({ outPath, onStarted }: TakeInput) {
  const videoId = `video_${path.basename(outPath, ".mp4")}`;
  await onStarted?.(videoId);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, "mp4");
  return { videoId };
}

const stateFile = (id: string) =>
  path.join(tempDir, "generations", id, "generation.json");
const readState = (id: string) => readJson<GenerationState>(stateFile(id));
const takeOf = (state: GenerationState, scriptId: string, index: number) =>
  state.scripts
    .find((entry) => entry.script.id === scriptId)
    ?.takes.find((take) => take.index === index);

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "generations-"));
  vi.stubEnv("ANALYSIS_DATA_DIR", tempDir);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.mocked(generateScripts).mockImplementation(fakeScripts);
  vi.mocked(generateTake).mockImplementation(fakeTake);
  vi.mocked(checkSoraAvailable).mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.mocked(generateScripts).mockReset();
  vi.mocked(generateTake).mockReset();
  vi.mocked(checkSoraAvailable).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe("validators", () => {
  it("rejects path traversal in generation ids and video file names", async () => {
    expect(isValidGenerationId("headandshoulders-20261010-014512")).toBe(true);
    expect(isValidGenerationId("headandshoulders-20261010-014512-2")).toBe(
      true,
    );
    for (const id of ["../secrets", "a/b", "..", "", "A B", "x".repeat(81)]) {
      expect(isValidGenerationId(id)).toBe(false);
    }
    expect(await getGeneration("../secrets")).toBeNull();
    expect(() => generationDir("../secrets")).toThrow();

    expect(isValidVideoFile("s1-take1.mp4")).toBe(true);
    expect(isValidVideoFile("s123-take3.mp4")).toBe(true);
    for (const file of [
      "../s1-take1.mp4",
      "s1-take1.mp4/..",
      "s1-take10.mp4",
      "s1-take1.mp4.tmp",
      "generation.json",
      "..%2Fgeneration.json",
    ]) {
      expect(isValidVideoFile(file)).toBe(false);
    }
  });
});

describe("createGeneration", () => {
  it("rejects a request over the 120 s cap before any OpenAI call", async () => {
    await expect(
      createGeneration({
        sourceId: SOURCE,
        briefIndexes: [0, 1, 2],
        settings: { hairstylesPerBrief: 5, takesPerScript: 3, seconds: 12 },
      }),
    ).rejects.toThrow(
      "This would render 540 s of video (≈ $54.00). The limit is 120 s.",
    );
    expect(generateScripts).not.toHaveBeenCalled();
    expect(generateTake).not.toHaveBeenCalled();
    expect(checkSoraAvailable).not.toHaveBeenCalled();
    await expect(stat(path.join(tempDir, "generations"))).rejects.toThrow();
  });

  it("checks Sora before anything is spent or stored", async () => {
    vi.mocked(checkSoraAvailable).mockRejectedValue(
      new Error("Sora is unavailable for this OpenAI key (404 Not found.)."),
    );
    await expect(createGeneration({ sourceId: SOURCE })).rejects.toThrow(
      "Sora is unavailable for this OpenAI key",
    );
    expect(generateScripts).not.toHaveBeenCalled();
    await expect(stat(path.join(tempDir, "generations"))).rejects.toThrow();
  });

  it("estimates with the configured model's price and rejects an unpriced one", async () => {
    vi.stubEnv("SORA_MODEL", "sora-2-pro");
    const state = await createGeneration({ sourceId: SOURCE });
    expect(state.estimatedCostUsd).toBe(14.4);

    vi.stubEnv("SORA_MODEL", "sora-9");
    vi.mocked(checkSoraAvailable).mockClear();
    await expect(createGeneration({ sourceId: SOURCE })).rejects.toThrow(
      'SORA_MODEL "sora-9" has no known price.',
    );
    expect(checkSoraAvailable).not.toHaveBeenCalled();
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
      estimatedCostUsd: 4.8,
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
    expect(state.estimatedCostUsd).toBe(2.4);
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
    vi.mocked(generateTake).mockImplementation(async (input) => {
      if (input.outPath.endsWith("s2-take2.mp4")) {
        await input.onStarted?.("video_moderated");
        throw new Error("Sora render failed: moderation_blocked");
      }
      return fakeTake(input);
    });
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
    expect(generateTake).toHaveBeenCalledTimes(6);
    expect(generateTake).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Prompt for s1",
        seconds: 8,
        outPath: path.join(generationDir(state.id), "s1-take1.mp4"),
      }),
    );
    expect(takeOf(stored!, "s2", 2)).toEqual({
      index: 2,
      status: "failed",
      soraVideoId: "video_moderated",
      file: null,
      error: "Sora render failed: moderation_blocked",
    });
    expect(takeOf(stored!, "s1", 1)).toEqual({
      index: 1,
      status: "completed",
      soraVideoId: "video_s1-take1",
      file: "s1-take1.mp4",
      error: null,
    });
    const completed = stored!.scripts
      .flatMap((entry) => entry.takes)
      .filter((take) => take.status === "completed");
    expect(completed).toHaveLength(5);
    expect(
      await readFile(
        path.join(generationDir(state.id), "s3-take2.mp4"),
        "utf8",
      ),
    ).toBe("mp4");
  });

  it("fails the job when no take renders, so a dead provider is not reported as completed", async () => {
    vi.mocked(generateTake).mockRejectedValue(
      new Error("Sora render failed: moderation_blocked"),
    );
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);

    const stored = await readState(state.id);
    expect(stored).toMatchObject({
      status: "failed",
      stage: "videos",
      error: "No take rendered: Sora render failed: moderation_blocked",
    });
    expect(generateTake).toHaveBeenCalledTimes(6);
    expect(
      stored!.scripts.flatMap((entry) => entry.takes.map((t) => t.status)),
    ).toEqual(Array(6).fill("failed"));
  });

  it("stops starting takes once Sora reports the key or model unavailable", async () => {
    vi.mocked(generateTake).mockRejectedValue(
      new SoraUnavailableError("Sora is unavailable: 403 No access to sora-2."),
    );
    const state = await createGeneration({ sourceId: SOURCE });
    await executeGeneration(state);

    const stored = await readState(state.id);
    // Only the takes already in flight (two at a time) reach Sora.
    expect(vi.mocked(generateTake).mock.calls.length).toBeLessThanOrEqual(2);
    expect(stored).toMatchObject({
      status: "failed",
      error: "No take rendered: Sora is unavailable: 403 No access to sora-2.",
    });
    for (const take of stored!.scripts.flatMap((entry) => entry.takes)) {
      expect(take).toMatchObject({
        status: "failed",
        error: "Sora is unavailable: 403 No access to sora-2.",
      });
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
    expect(generateTake).not.toHaveBeenCalled();
  });

  it("skips takes whose video file already exists", async () => {
    const state = await createGeneration({
      sourceId: SOURCE,
      briefIndexes: [0],
    });
    await mkdir(generationDir(state.id), { recursive: true });
    await writeFile(path.join(generationDir(state.id), "s1-take1.mp4"), "old");
    await executeGeneration(state);

    expect(generateTake).toHaveBeenCalledTimes(1);
    const stored = await readState(state.id);
    expect(takeOf(stored!, "s1", 1)).toMatchObject({
      status: "completed",
      file: "s1-take1.mp4",
    });
    expect(takeOf(stored!, "s1", 2)?.status).toBe("completed");
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

  it("keeps finished takes playable when the rendering process died", async () => {
    const state = await createGeneration({ sourceId: SOURCE });
    const [entry] = await fakeScripts(null, [
      { briefIndex: 0, hairstyle: "sleek low bun" },
    ]);
    const take = (index: number, status: "completed" | "running") => ({
      index,
      status,
      soraVideoId: `video_${index}`,
      file: status === "completed" ? `s1-take${index}.mp4` : null,
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
      file: "s1-take1.mp4",
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
    vi.mocked(generateTake).mockImplementation(async (input) => {
      if (input.outPath.endsWith("s1-take2.mp4"))
        throw new Error("Sora render failed: failed");
      return fakeTake(input);
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

  it("returns null for a generation that does not exist", async () => {
    expect(await pickTake("missing-20261010-000000", "s1", 1)).toBeNull();
    expect(await pickTake("../secrets", "s1", 1)).toBeNull();
  });

  it("keeps a pick made while other takes are still rendering", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(generateTake).mockImplementation(async (input) => {
      if (input.outPath.endsWith("s1-take2.mp4")) await blocked;
      return fakeTake(input);
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
