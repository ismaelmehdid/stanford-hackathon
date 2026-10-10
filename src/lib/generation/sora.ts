import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import OpenAI from "openai";
import { requireEnv } from "@/lib/analysis/config";
import { SORA_SIZE, soraModel, type VideoLength } from "./config";

const DEFAULT_POLL_MS = 10_000;
// A stuck render must not hold a concurrency slot forever; Sora usually finishes in a few minutes.
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DOWNLOAD_ATTEMPTS = 3;
// The key, the model or the whole API cannot be used; every other take would fail the same way.
const UNAVAILABLE_STATUSES = new Set([401, 403, 404, 410]);
// Statuses the SDK itself treats as worth retrying; any other 4xx is a definite answer.
const TRANSIENT_STATUSES = new Set([408, 409, 429]);

/** Thrown when Sora refuses this key or model, so the caller can skip the remaining takes. */
export class SoraUnavailableError extends Error {}

let client: OpenAI | undefined;
const openai = () =>
  (client ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") }));

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
// SDK API errors carry the HTTP status; connection errors and timeouts do not.
const apiStatus = (error: unknown) => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
};
const isDefiniteApiError = (error: unknown) => {
  const status = apiStatus(error);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    !TRANSIENT_STATUSES.has(status)
  );
};

/** A free call that fails when the Sora API is gone or this key cannot use it. Starts no render. */
export async function checkSoraAvailable(): Promise<void> {
  try {
    await openai().videos.list({ limit: 1 });
  } catch (error) {
    throw new Error(
      `Sora is unavailable for this OpenAI key (${errorMessage(error)}). Nothing was spent.`,
      { cause: error },
    );
  }
}

/** Renders one take with Sora, waits for it, and saves the MP4 to `outPath`. */
export async function generateTake(input: {
  prompt: string;
  seconds: VideoLength;
  outPath: string;
  onStarted?: (videoId: string) => void | Promise<void>;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<{ videoId: string }> {
  const pollMs = input.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sora = openai();
  let video;
  try {
    // Never retried: the server may have accepted the job already, and a retry would bill a second render.
    video = await sora.videos.create(
      {
        model: soraModel(),
        prompt: input.prompt,
        seconds: `${input.seconds}`,
        size: SORA_SIZE,
      },
      { maxRetries: 0 },
    );
  } catch (error) {
    const status = apiStatus(error);
    if (status !== undefined && UNAVAILABLE_STATUSES.has(status)) {
      throw new SoraUnavailableError(
        `Sora is unavailable: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    throw error;
  }
  await input.onStarted?.(video.id);

  // The render is paid from here on, so a dropped connection keeps polling instead of losing the take.
  const startedAt = Date.now();
  while (video.status === "queued" || video.status === "in_progress") {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `Sora render timed out after ${Math.round(timeoutMs / 60_000)} min (status: ${video.status}).`,
      );
    }
    await sleep(pollMs);
    try {
      video = await sora.videos.retrieve(video.id);
    } catch (error) {
      if (isDefiniteApiError(error)) throw error;
      console.error(
        `Sora poll for ${video.id} failed, retrying`,
        errorMessage(error),
      );
    }
  }
  if (video.status !== "completed") {
    throw new Error(
      `Sora render failed: ${video.error?.message || video.status}`,
    );
  }

  const bytes = await downloadVideo(sora, video.id, pollMs);
  // Write to a temp file, then rename, so a half-written take never looks finished.
  await mkdir(path.dirname(input.outPath), { recursive: true });
  const temp = `${input.outPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, input.outPath);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return { videoId: video.id };
}

async function downloadVideo(sora: OpenAI, videoId: string, retryMs: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await sora.videos.downloadContent(videoId);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= DOWNLOAD_ATTEMPTS) throw error;
      await sleep(retryMs * attempt);
    }
  }
}
