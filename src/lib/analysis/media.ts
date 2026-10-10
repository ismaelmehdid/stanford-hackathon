import { execFile } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { MAX_FRAMES } from "./config";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;
const HOOK_TIMESTAMPS = [0, 1, 2];
const MIN_GAP_SECONDS = 0.5;
const SCENE_THRESHOLD = 0.3;
// How far to step back when the requested last frame lies past the end of the video stream.
const LAST_FRAME_FALLBACK_SECONDS = [0.5, 1, 2, 4];

export type Frame = { timestampSeconds: number; file: string };
export type VideoProbe = { durationSeconds: number; hasAudio: boolean };

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

function ffmpegBinary() {
  const binary = process.env.FFMPEG_PATH || ffmpegStatic;
  if (!binary)
    throw new Error(
      "ffmpeg binary not found. Reinstall ffmpeg-static or set FFMPEG_PATH.",
    );
  return binary;
}

// ffmpeg reports everything useful on stderr.
async function ffmpeg(args: string[]) {
  const { stderr } = await execFileAsync(
    ffmpegBinary(),
    ["-hide_banner", ...args],
    { maxBuffer: MAX_BUFFER },
  );
  return stderr;
}

export function selectFrameTimestamps(
  sceneTimes: number[],
  durationSeconds: number,
  maxFrames = MAX_FRAMES,
) {
  const isFar = (time: number, chosen: number[]) =>
    chosen.every((other) => Math.abs(other - time) >= MIN_GAP_SECONDS);
  const required: number[] = [];
  const last = Math.max(0, durationSeconds - 0.1);
  for (const time of [
    ...HOOK_TIMESTAMPS.filter((time) => time < durationSeconds),
    last,
  ]) {
    if (isFar(time, required)) required.push(time);
  }
  const scenes: number[] = [];
  for (const time of [...sceneTimes].sort((a, b) => a - b)) {
    if (
      time > 0 &&
      time < durationSeconds &&
      isFar(time, [...required, ...scenes])
    )
      scenes.push(time);
  }
  const room = Math.max(0, maxFrames - required.length);
  const sampled =
    scenes.length <= room
      ? scenes
      : Array.from(
          { length: room },
          (_, index) => scenes[Math.floor((index * scenes.length) / room)],
        );
  return [...required, ...sampled]
    .sort((a, b) => a - b)
    .map((time) => Math.round(time * 100) / 100);
}

export function parseProbe(stderr: string): VideoProbe {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSeconds = match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : 0;
  return { durationSeconds, hasAudio: /Stream #.*Audio:/.test(stderr) };
}

export const parseSceneTimes = (stderr: string) =>
  [...stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((match) =>
    Number(match[1]),
  );

export const isValidFrameRequest = (shortCode: string, file: string) =>
  /^[A-Za-z0-9_-]{1,40}$/.test(shortCode) && /^\d{1,9}\.jpg$/.test(file);

export async function downloadVideo(videoUrl: string | null, outPath: string) {
  if (await exists(outPath)) return;
  if (!videoUrl) throw new Error("The scrape result has no video URL.");
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(
      `Video download failed (${response.status}). Instagram video links expire after a few days; delete .data/cache/apify and start a new run.`,
    );
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  // Write to a temp file, then rename, so an interrupted download is never mistaken for a cached one.
  const temp = `${outPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, Buffer.from(await response.arrayBuffer()));
  await rename(temp, outPath);
}

export async function probeVideo(videoPath: string): Promise<VideoProbe> {
  // "ffmpeg -i" with no output exits non-zero but still prints the stream info.
  const stderr = await execFileAsync(
    ffmpegBinary(),
    ["-hide_banner", "-i", videoPath],
    { maxBuffer: MAX_BUFFER },
  ).then(
    (result) => result.stderr,
    (error: { stderr?: string }) => error.stderr ?? "",
  );
  return parseProbe(stderr);
}

export async function detectScenes(videoPath: string) {
  const stderr = await ffmpeg([
    "-i",
    videoPath,
    "-vf",
    `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
    "-an",
    "-f",
    "null",
    "-",
  ]);
  return parseSceneTimes(stderr);
}

async function extractFrame(
  videoPath: string,
  outDir: string,
  timestampSeconds: number,
): Promise<Frame | null> {
  const file = `${Math.round(timestampSeconds * 1000)}.jpg`;
  const outPath = path.join(outDir, file);
  await ffmpeg([
    "-y",
    "-ss",
    String(timestampSeconds),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=512:-2",
    "-q:v",
    "4",
    outPath,
  ]);
  // Seeking past the end of the video stream exits 0 but writes no frame.
  return (await exists(outPath)) ? { timestampSeconds, file } : null;
}

export async function extractFrames(
  videoPath: string,
  outDir: string,
  timestamps: number[],
): Promise<Frame[]> {
  await mkdir(outDir, { recursive: true });
  const frames: Frame[] = [];
  for (const [index, timestampSeconds] of timestamps.entries()) {
    let frame = await extractFrame(videoPath, outDir, timestampSeconds);
    // The video stream can end before the container duration (audio runs longer); the last frame is required, so step back.
    if (!frame && index === timestamps.length - 1) {
      const previous = frames.at(-1)?.timestampSeconds ?? -1;
      for (const back of LAST_FRAME_FALLBACK_SECONDS) {
        const earlier = Math.round((timestampSeconds - back) * 100) / 100;
        if (earlier <= previous || earlier < 0) break;
        frame = await extractFrame(videoPath, outDir, earlier);
        if (frame) break;
      }
    }
    if (frame) frames.push(frame);
  }
  return frames;
}

export async function extractAudio(videoPath: string, outPath: string) {
  await ffmpeg([
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    outPath,
  ]);
}
