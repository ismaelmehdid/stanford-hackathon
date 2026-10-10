import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  detectScenes,
  downloadVideo,
  extractAudio,
  extractFrames,
  isValidFrameRequest,
  parseProbe,
  parseSceneTimes,
  probeVideo,
  selectFrameTimestamps,
} from "./media";

describe("selectFrameTimestamps", () => {
  it("always keeps the hook frames and the last frame", () => {
    expect(selectFrameTimestamps([], 10)).toEqual([0, 1, 2, 9.9]);
  });

  it("adds scene changes at least 0.5 s apart", () => {
    expect(selectFrameTimestamps([2.2, 4, 4.3, 7], 10)).toEqual([
      0, 1, 2, 4, 7, 9.9,
    ]);
  });

  it("caps the total and samples scenes evenly", () => {
    const scenes = Array.from({ length: 100 }, (_, index) => 3 + index * 0.6);
    const result = selectFrameTimestamps(scenes, 70, 24);
    expect(result).toHaveLength(24);
    expect(result.slice(0, 3)).toEqual([0, 1, 2]);
    expect(result.at(-1)).toBe(69.9);
  });

  it("handles very short and unknown durations", () => {
    expect(selectFrameTimestamps([], 1.5)).toEqual([0, 1]);
    expect(selectFrameTimestamps([], 0)).toEqual([0]);
  });
});

describe("ffmpeg output parsing", () => {
  it("reads duration and audio presence", () => {
    const stderr =
      "  Duration: 00:01:02.50, start: 0.0\n  Stream #0:1[0x2](und): Audio: aac (LC)";
    expect(parseProbe(stderr)).toEqual({
      durationSeconds: 62.5,
      hasAudio: true,
    });
    expect(parseProbe("Duration: 00:00:05.00")).toEqual({
      durationSeconds: 5,
      hasAudio: false,
    });
  });

  it("reads scene timestamps from showinfo", () => {
    expect(
      parseSceneTimes(
        "n:0 pts:123 pts_time:1.23 x\nn:1 pts:456 pts_time:4.5 y",
      ),
    ).toEqual([1.23, 4.5]);
  });
});

describe("isValidFrameRequest", () => {
  it("accepts cached frame names only", () => {
    expect(isValidFrameRequest("DeHlXOFtWfc", "1500.jpg")).toBe(true);
    expect(isValidFrameRequest("..", "1500.jpg")).toBe(false);
    expect(isValidFrameRequest("DeHlXOFtWfc", "../video.mp4")).toBe(false);
  });
});

describe("downloadVideo", () => {
  it("explains expired links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 403 })),
    );
    await expect(
      downloadVideo(
        "https://cdn.example/v.mp4",
        path.join(os.tmpdir(), "missing", "v.mp4"),
      ),
    ).rejects.toThrow(/expire/);
    vi.unstubAllGlobals();
  });

  it("writes the file in one step and leaves no temp file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
    );
    const dir = await mkdtemp(path.join(os.tmpdir(), "download-"));
    await downloadVideo("https://cdn.example/v.mp4", path.join(dir, "v.mp4"));
    expect(await readdir(dir)).toEqual(["v.mp4"]);
    expect([...(await readFile(path.join(dir, "v.mp4")))]).toEqual([1, 2, 3]);
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("ffmpeg integration", () => {
  let dir: string;
  let videoPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "media-"));
    videoPath = path.join(dir, "video.mp4");
    await promisify(execFile)(ffmpegStatic as string, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=3:size=320x240:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=3",
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      videoPath,
    ]);
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("probes, detects scenes, extracts frames and audio", async () => {
    const probe = await probeVideo(videoPath);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSeconds).toBeCloseTo(3, 0);
    expect(Array.isArray(await detectScenes(videoPath))).toBe(true);
    const frames = await extractFrames(
      videoPath,
      path.join(dir, "frames"),
      [0, 1, 2.5],
    );
    expect(frames.map((frame) => frame.file)).toEqual([
      "0.jpg",
      "1000.jpg",
      "2500.jpg",
    ]);
    expect(await readdir(path.join(dir, "frames"))).toHaveLength(3);
    await extractAudio(videoPath, path.join(dir, "audio.mp3"));
    expect(await readdir(dir)).toContain("audio.mp3");
  });

  it("steps back for the last frame when the audio outlasts the video", async () => {
    const longAudio = path.join(dir, "long-audio.mp4");
    await promisify(execFile)(ffmpegStatic as string, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=3:size=320x240:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=3.4",
      "-pix_fmt",
      "yuv420p",
      longAudio,
    ]);
    const { durationSeconds } = await probeVideo(longAudio);
    const frames = await extractFrames(
      longAudio,
      path.join(dir, "long-frames"),
      [0, Math.max(0, durationSeconds - 0.1)],
    );
    expect(frames).toHaveLength(2);
    expect(frames[1].timestampSeconds).toBeGreaterThan(2);
    expect(frames[1].timestampSeconds).toBeLessThan(3);
  });
});
