import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/headandshoulders-videos.json";
import { normalizeVideo, type ApifyPostItem } from "./instagram";
import * as ai from "./openai";
import {
  analyzeOneVideo,
  buildConclusionInput,
  creatorsToScrape,
  mapWithConcurrency,
  throwIfProfileError,
} from "./pipeline";
import type { VideoAnalysis } from "./schema";
import type { ScoredVideo } from "./scoring";

vi.mock("./media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./media")>()),
  downloadVideo: vi.fn(async () => {}),
  probeVideo: vi.fn(async () => ({ durationSeconds: 5, hasAudio: true })),
  detectScenes: vi.fn(async () => []),
  extractFrames: vi.fn(async () => [{ timestampSeconds: 0, file: "0.jpg" }]),
  extractAudio: vi.fn(async () => {}),
}));

vi.mock("./openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./openai")>()),
  transcribe: vi.fn(),
  analyzeVideo: vi.fn(),
  analyzeComments: vi.fn(),
}));

const collab = normalizeVideo(
  (fixture as unknown as ApifyPostItem[]).find(
    (item) => item.shortCode === "DeHlXOFtWfc",
  )!,
)!;
const scoredItem: ScoredVideo = {
  video: collab,
  creator: "haleighcaruso",
  source: "collab",
  brand: null,
  influencer: null,
  tier: "amplify",
  rank: 1,
};
const fakeAnalysis = { videoType: "tutorial" } as VideoAnalysis;

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "pipeline-"));
  vi.stubEnv("ANALYSIS_DATA_DIR", tempDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.mocked(ai.transcribe).mockReset();
  vi.mocked(ai.analyzeVideo).mockReset();
  vi.mocked(ai.analyzeComments).mockReset();
  await rm(tempDir, { recursive: true, force: true });
});

describe("mapWithConcurrency", () => {
  it("processes every item with at most `limit` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      done.push(item);
      inFlight--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("throwIfProfileError", () => {
  it("explains private or missing profiles", () => {
    expect(() => throwIfProfileError([], "nobody")).toThrow(
      "No posts returned for @nobody",
    );
    expect(() =>
      throwIfProfileError(
        [{ error: "not_found", errorDescription: "Page not found" }],
        "nobody",
      ),
    ).toThrow("@nobody: Page not found");
    expect(() =>
      throwIfProfileError([{ shortCode: "a" }], "brand"),
    ).not.toThrow();
  });
});

describe("analyzeOneVideo", () => {
  it("keeps the video analysis when comment analysis fails", async () => {
    vi.mocked(ai.transcribe).mockResolvedValue("hello");
    vi.mocked(ai.analyzeVideo).mockResolvedValue(fakeAnalysis);
    vi.mocked(ai.analyzeComments).mockRejectedValue(new Error("refused"));

    const outcome = await analyzeOneVideo(scoredItem);
    expect(outcome.videoAnalysis).toEqual(fakeAnalysis);
    expect(outcome.transcript).toBe("hello");
    expect(outcome.commentAnalysis).toBeNull();
    expect(outcome.warnings).toEqual(["Comment analysis failed: refused"]);
  });

  it("does not cache a video analysis made without its transcript", async () => {
    vi.mocked(ai.transcribe).mockRejectedValue(new Error("rate limited"));
    vi.mocked(ai.analyzeVideo).mockResolvedValue(fakeAnalysis);
    vi.mocked(ai.analyzeComments).mockResolvedValue(null as never);

    const first = await analyzeOneVideo(scoredItem);
    expect(first.transcript).toBeNull();
    expect(first.warnings).toEqual(["Transcription failed: rate limited"]);
    expect(ai.analyzeVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transcript: null,
        transcriptUnavailable: true,
      }),
    );

    vi.mocked(ai.transcribe).mockResolvedValue("step one, step two");
    const second = await analyzeOneVideo(scoredItem);
    expect(ai.analyzeVideo).toHaveBeenCalledTimes(2);
    expect(ai.analyzeVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transcript: "step one, step two",
        transcriptUnavailable: false,
      }),
    );
    expect(second.warnings).toEqual([]);
  });
});

describe("buildConclusionInput", () => {
  it("identifies videos by the same id as analysis.videos[].id", () => {
    const input = buildConclusionInput(
      [scoredItem],
      new Map([
        [
          collab.shortCode,
          {
            frames: [],
            transcript: null,
            videoAnalysis: fakeAnalysis,
            commentAnalysis: null,
          },
        ],
      ]),
    );
    expect(input.map((video) => video.id)).toEqual([collab.id]);
    expect(collab.id).not.toBe(collab.shortCode);
  });
});

describe("creatorsToScrape", () => {
  it("leaves out creators whose only brand videos are too recent to score", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const entry = (creator: string, postedAt: string) => ({
      video: { ...collab, postedAt },
      match: { creator, source: "collab" as const },
    });
    expect(
      creatorsToScrape(
        [
          entry("fresh", "2026-10-09T00:00:00Z"),
          entry("older", "2026-09-01T00:00:00Z"),
          entry("oldest", "2026-08-01T00:00:00Z"),
        ],
        2,
        now,
      ),
    ).toEqual(["older", "oldest"]);
  });
});
