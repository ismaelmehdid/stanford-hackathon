import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI, { APIConnectionTimeoutError, APIError, toFile } from "openai";
import { requireEnv } from "@/lib/analysis/config";
import {
  IMAGE_SIZE,
  imageModel,
  imageQuality,
  imageUsageCostUsd,
} from "./config";
import type { StoryboardFrame } from "./schema";

export type PreviewFrame = {
  label: StoryboardFrame["label"];
  atSecond: number;
  file: string;
};

// The key, the model or the whole image API cannot be used; every other take would fail the same way.
const UNAVAILABLE_STATUSES = new Set([401, 403, 404]);
// A high-quality 1024x1536 image can take a couple of minutes; stay under undici's 300 s headers timeout.
const REQUEST_TIMEOUT_MS = 290_000;
// Never retried by the SDK: OpenAI keeps rendering a request the client gave up on and bills it.
const REQUEST_OPTIONS = { maxRetries: 0, timeout: REQUEST_TIMEOUT_MS };
// Image requests in flight at once across every generation in this process (the default account limit is about 20 images per minute).
const IMAGE_CONCURRENCY = 2;
// A 429 is never billed, so the frame is retried once the rate limit window has passed.
const RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_WAIT_MS = 120_000;
const REFERENCE_PREFIX =
  "Same person, same setting and lighting as the reference image. ";
// Appended to every prompt, so the no-text rule holds even when a script's prompt does not repeat it.
const NO_TEXT_RULE =
  "No text, captions, watermarks, logos, brand names or readable label text anywhere in the image; any product packaging is plain or carries only abstract shapes.";

/** Thrown when the image API refuses this key or model, so the caller can skip the remaining takes. */
export class PreviewUnavailableError extends Error {}

let client: OpenAI | undefined;
const openai = () =>
  (client ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") }));

type ImageLimiter = { active: number; waiting: (() => void)[] };
// Kept on globalThis so every generation, and Next.js dev hot reloads, share one limit.
const globalImages = globalThis as typeof globalThis & {
  __imageLimiter?: ImageLimiter;
};
const limiter = (globalImages.__imageLimiter ??= { active: 0, waiting: [] });

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A free call that fails when this key cannot use the image model. Renders nothing. */
export async function checkPreviewAvailable(): Promise<void> {
  try {
    await openai().models.retrieve(imageModel());
  } catch (error) {
    throw new Error(
      `Image previews are unavailable for this OpenAI key (${errorMessage(error)}). Nothing was spent.`,
      { cause: error },
    );
  }
}

/**
 * Renders a storyboard: frame 1 from its prompt, every later frame as an edit of frame 1 so the
 * person and setting stay the same. Writes `<outDir>/<filePrefix>-f<n>.jpg` and returns the real cost.
 */
export async function generateStoryboard(input: {
  frames: StoryboardFrame[];
  outDir: string;
  filePrefix: string;
  /** Called once each frame's file is on disk, with the cost spent on this storyboard so far. */
  onFrame?: (frame: PreviewFrame, costUsd: number) => void | Promise<void>;
}): Promise<{ frames: PreviewFrame[]; costUsd: number }> {
  const images = openai().images;
  const model = imageModel();
  const quality = imageQuality();
  const common = {
    model,
    size: IMAGE_SIZE,
    quality,
    output_format: "jpeg",
  } as const;

  const written: PreviewFrame[] = [];
  let costUsd = 0;
  let reference: Buffer | undefined;
  for (const [index, frame] of input.frames.entries()) {
    const frameName = `frame ${index + 1} (${frame.label})`;
    const response = await callImageApi(frameName, () =>
      reference === undefined
        ? images.generate(
            { ...common, prompt: `${frame.imagePrompt} ${NO_TEXT_RULE}` },
            REQUEST_OPTIONS,
          )
        : toFile(reference, "reference.jpg", { type: "image/jpeg" }).then(
            (image) =>
              images.edit(
                {
                  ...common,
                  image,
                  prompt: `${REFERENCE_PREFIX}${frame.imagePrompt} ${NO_TEXT_RULE}`,
                },
                REQUEST_OPTIONS,
              ),
          ),
    );
    costUsd += imageUsageCostUsd(response.usage);

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`The image API returned no image for ${frameName}.`);
    }
    const bytes = Buffer.from(b64, "base64");
    reference ??= bytes;

    const file = `${input.filePrefix}-f${index + 1}.jpg`;
    await writeAtomically(path.join(input.outDir, file), bytes);
    const preview = { label: frame.label, atSecond: frame.atSecond, file };
    written.push(preview);
    await input.onFrame?.(preview, costUsd);
  }
  return { frames: written, costUsd };
}

// Waits for a free slot; a finished request hands its slot straight to the next one waiting.
async function withImageSlot<T>(task: () => Promise<T>): Promise<T> {
  if (limiter.active < IMAGE_CONCURRENCY) limiter.active++;
  else await new Promise<void>((resolve) => limiter.waiting.push(resolve));
  try {
    return await task();
  } finally {
    const next = limiter.waiting.shift();
    if (next) next();
    else limiter.active--;
  }
}

// An exhausted quota also answers 429, but waiting does not fix it.
const isRateLimited = (error: unknown): error is APIError =>
  error instanceof APIError &&
  error.status === 429 &&
  error.code !== "insufficient_quota";

function rateLimitWaitMs(error: APIError) {
  const headers = error.headers;
  const ms = Number(headers?.get("retry-after-ms"));
  const seconds = Number(headers?.get("retry-after"));
  const wait =
    ms > 0 ? ms : seconds > 0 ? seconds * 1000 : DEFAULT_RATE_LIMIT_WAIT_MS;
  return Math.min(wait, MAX_RATE_LIMIT_WAIT_MS);
}

// The slot stays held while waiting out a rate limit, so the other requests back off too.
function callImageApi<T>(frameName: string, request: () => Promise<T>) {
  return withImageSlot(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request();
      } catch (error) {
        if (isRateLimited(error) && attempt < RATE_LIMIT_RETRIES) {
          await sleep(rateLimitWaitMs(error));
          continue;
        }
        throw describeImageError(frameName, error);
      }
    }
  });
}

function describeImageError(frameName: string, error: unknown): unknown {
  if (
    error instanceof APIError &&
    error.status !== undefined &&
    UNAVAILABLE_STATUSES.has(error.status)
  ) {
    return new PreviewUnavailableError(
      `Image previews are unavailable: ${error.message}`,
      { cause: error },
    );
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new Error(
      `The image request for ${frameName} timed out after ${REQUEST_TIMEOUT_MS / 1000} s. OpenAI may still have rendered and billed it.`,
      { cause: error },
    );
  }
  return error;
}

// Write to a temp file, then rename, so a half-written frame never looks finished.
async function writeAtomically(outPath: string, bytes: Buffer) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const temp = `${outPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, outPath);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
