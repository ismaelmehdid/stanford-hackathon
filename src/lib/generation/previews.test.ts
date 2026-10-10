import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APIConnectionTimeoutError, APIError } from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const edit = vi.fn();
const retrieve = vi.fn();
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  class FakeOpenAI {
    images = { generate, edit };
    models = { retrieve };
  }
  // Keep the real toFile and error classes; only the client is fake.
  return { ...actual, default: FakeOpenAI, OpenAI: FakeOpenAI };
});

const { checkPreviewAvailable, generateStoryboard, PreviewUnavailableError } =
  await import("./previews");

const NO_TEXT_RULE =
  "No text, captions, watermarks, logos, brand names or readable label text anywhere in the image; any product packaging is plain or carries only abstract shapes.";
const REQUEST_OPTIONS = { maxRetries: 0, timeout: 290_000 };

const frames = [
  { label: "hook", atSecond: 0, imagePrompt: "Hook prompt." },
  { label: "product", atSecond: 4, imagePrompt: "Product prompt." },
  { label: "reveal", atSecond: 8, imagePrompt: "Reveal prompt." },
] as const;

const usage = (text: number, image: number, output: number) => ({
  input_tokens: text + image,
  input_tokens_details: { text_tokens: text, image_tokens: image },
  output_tokens: output,
  total_tokens: text + image + output,
});

const imageResponse = (bytes: number[], tokens = usage(0, 0, 0)) => ({
  created: 0,
  data: [{ b64_json: Buffer.from(bytes).toString("base64") }],
  usage: tokens,
});

const apiError = (
  status: number,
  message: string,
  headers: Record<string, string> = {},
  code?: string,
) =>
  APIError.generate(
    status,
    { error: { message, code } },
    message,
    new Headers(headers),
  );

let dir: string;

beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("PREVIEW_IMAGE_MODEL", "");
  vi.stubEnv("PREVIEW_IMAGE_QUALITY", "");
  dir = await mkdtemp(path.join(os.tmpdir(), "previews-"));
});

afterEach(async () => {
  vi.useRealTimers();
  generate.mockReset();
  edit.mockReset();
  retrieve.mockReset();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("generateStoryboard", () => {
  it("renders frame 1, then edits frames 2 and 3 from it as the reference", async () => {
    generate.mockResolvedValue(imageResponse([1, 1, 1]));
    edit
      .mockResolvedValueOnce(imageResponse([2, 2]))
      .mockResolvedValueOnce(imageResponse([3]));
    const onFrame = vi.fn();
    const outDir = path.join(dir, "nested");

    const result = await generateStoryboard({
      frames: [...frames],
      outDir,
      filePrefix: "s1-take2",
      onFrame,
    });

    expect(result.frames).toEqual([
      { label: "hook", atSecond: 0, file: "s1-take2-f1.jpg" },
      { label: "product", atSecond: 4, file: "s1-take2-f2.jpg" },
      { label: "reveal", atSecond: 8, file: "s1-take2-f3.jpg" },
    ]);
    expect((await readdir(outDir)).sort()).toEqual([
      "s1-take2-f1.jpg",
      "s1-take2-f2.jpg",
      "s1-take2-f3.jpg",
    ]);
    expect([...(await readFile(path.join(outDir, "s1-take2-f1.jpg")))]).toEqual(
      [1, 1, 1],
    );
    expect([...(await readFile(path.join(outDir, "s1-take2-f2.jpg")))]).toEqual(
      [2, 2],
    );
    expect([...(await readFile(path.join(outDir, "s1-take2-f3.jpg")))]).toEqual(
      [3],
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      {
        model: "gpt-image-2",
        prompt: `Hook prompt. ${NO_TEXT_RULE}`,
        size: "1024x1536",
        quality: "medium",
        output_format: "jpeg",
      },
      REQUEST_OPTIONS,
    );

    expect(edit).toHaveBeenCalledTimes(2);
    for (const [index, call] of edit.mock.calls.entries()) {
      const [body, options] = call;
      expect(body).toMatchObject({
        model: "gpt-image-2",
        prompt: `Same person, same setting and lighting as the reference image. ${frames[index + 1].imagePrompt} ${NO_TEXT_RULE}`,
        size: "1024x1536",
        quality: "medium",
        output_format: "jpeg",
      });
      // Never retried by the SDK: a timed-out render may still be billed.
      expect(options).toEqual(REQUEST_OPTIONS);
      const reference = body.image as File;
      expect(reference.type).toBe("image/jpeg");
      expect([...new Uint8Array(await reference.arrayBuffer())]).toEqual([
        1, 1, 1,
      ]);
    }

    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(onFrame.mock.calls.map(([frame]) => frame.file)).toEqual([
      "s1-take2-f1.jpg",
      "s1-take2-f2.jpg",
      "s1-take2-f3.jpg",
    ]);
  });

  it("calls onFrame only after that frame's file exists", async () => {
    generate.mockResolvedValue(imageResponse([1]));
    edit.mockResolvedValue(imageResponse([2]));
    const seen: string[][] = [];

    await generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
      onFrame: async () => {
        seen.push((await readdir(dir)).sort());
      },
    });

    expect(seen).toEqual([
      ["s1-take1-f1.jpg"],
      ["s1-take1-f1.jpg", "s1-take1-f2.jpg"],
      ["s1-take1-f1.jpg", "s1-take1-f2.jpg", "s1-take1-f3.jpg"],
    ]);
  });

  it("sums the cost of every image from its token usage", async () => {
    // Text input $5, image input $8, image output $30 per 1M tokens.
    generate.mockResolvedValue(imageResponse([1], usage(2000, 0, 2000)));
    edit.mockResolvedValue(imageResponse([2], usage(2000, 2500, 2000)));
    const onFrame = vi.fn();

    const result = await generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
      onFrame,
    });

    expect(result.costUsd).toBeCloseTo(0.07 + 0.09 + 0.09, 6);
    expect(onFrame.mock.calls.map(([, costUsd]) => costUsd)).toEqual([
      expect.closeTo(0.07, 6),
      expect.closeTo(0.16, 6),
      expect.closeTo(0.25, 6),
    ]);
  });

  it("counts an image without usage as free rather than failing", async () => {
    generate.mockResolvedValue({ ...imageResponse([1]), usage: undefined });
    edit.mockResolvedValue(imageResponse([2], usage(2000, 2500, 2000)));

    const result = await generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
    });

    expect(result.costUsd).toBeCloseTo(0.18, 6);
  });

  it("uses PREVIEW_IMAGE_MODEL and PREVIEW_IMAGE_QUALITY when set", async () => {
    vi.stubEnv("PREVIEW_IMAGE_MODEL", "gpt-image-2-mini");
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "low");
    generate.mockResolvedValue(imageResponse([1]));
    edit.mockResolvedValue(imageResponse([2]));

    await generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
    });

    expect(generate.mock.calls[0][0]).toMatchObject({
      model: "gpt-image-2-mini",
      quality: "low",
    });
    expect(edit.mock.calls[0][0]).toMatchObject({
      model: "gpt-image-2-mini",
      quality: "low",
    });
  });

  it("reports a refused key or missing model as PreviewUnavailableError", async () => {
    for (const status of [401, 403, 404]) {
      generate.mockRejectedValueOnce(apiError(status, `${status} No access.`));
      const error = await generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PreviewUnavailableError);
      expect((error as Error).message).toContain(`${status} No access.`);
      expect((error as Error).cause).toBeInstanceOf(APIError);
    }
    expect(edit).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it("maps a 404 from an edit call too", async () => {
    generate.mockResolvedValue(imageResponse([1]));
    edit.mockRejectedValue(apiError(404, "404 Model not found."));

    await expect(
      generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }),
    ).rejects.toBeInstanceOf(PreviewUnavailableError);
  });

  it("passes other errors through unchanged", async () => {
    const moderated = apiError(400, "400 Your request was rejected.");
    generate.mockResolvedValue(imageResponse([1]));
    edit.mockRejectedValue(moderated);
    const onFrame = vi.fn();

    const error = await generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
      onFrame,
    }).catch((caught: unknown) => caught);

    expect(error).toBe(moderated);
    expect(error).not.toBeInstanceOf(PreviewUnavailableError);
    expect(onFrame).toHaveBeenCalledTimes(1);

    const connection = new Error("Connection error.");
    generate.mockRejectedValueOnce(connection);
    await expect(
      generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }),
    ).rejects.toBe(connection);
  });

  it("waits out a rate limit and retries that frame", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    generate
      .mockRejectedValueOnce(
        apiError(429, "429 Rate limit reached.", { "retry-after": "2" }),
      )
      .mockResolvedValue(imageResponse([1]));
    edit.mockResolvedValue(imageResponse([2]));

    const run = generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const result = await run;
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.frames).toHaveLength(3);
  });

  it("waits a full minute when a rate limit gives no retry-after, and gives up after 3 retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const limited = apiError(429, "429 Rate limit reached.");
    generate.mockRejectedValue(limited);

    const run = generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
    }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect(await run).toBe(limited);
    expect(generate).toHaveBeenCalledTimes(4);
    expect(edit).not.toHaveBeenCalled();
  });

  it("does not retry an exhausted quota", async () => {
    const quota = apiError(
      429,
      "429 You exceeded your current quota.",
      {},
      "insufficient_quota",
    );
    generate.mockRejectedValue(quota);

    await expect(
      generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }),
    ).rejects.toBe(quota);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("says a timed-out frame may still have been billed, without retrying it", async () => {
    generate.mockResolvedValue(imageResponse([1]));
    edit.mockRejectedValue(new APIConnectionTimeoutError());

    const error = await generateStoryboard({
      frames: [...frames],
      outDir: dir,
      filePrefix: "s1-take1",
    }).catch((caught: unknown) => caught);

    expect((error as Error).message).toBe(
      "The image request for frame 2 (product) timed out after 290 s. OpenAI may still have rendered and billed it.",
    );
    expect((error as Error).cause).toBeInstanceOf(APIConnectionTimeoutError);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("keeps at most two image requests in flight across every storyboard in the process", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = (bytes: number[]) => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return imageResponse(bytes);
    };
    generate.mockImplementation(slow([1]));
    edit.mockImplementation(slow([2]));

    await Promise.all(
      [1, 2, 3].map((script) =>
        generateStoryboard({
          frames: [...frames],
          outDir: dir,
          filePrefix: `s${script}-take1`,
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(edit).toHaveBeenCalledTimes(6);
  });

  it("throws when the response has no image data", async () => {
    generate.mockResolvedValue({ created: 0, data: [{}] });

    await expect(
      generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }),
    ).rejects.toThrow("no image");
    expect(edit).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it("throws when an edit response has no image data", async () => {
    generate.mockResolvedValue(imageResponse([1]));
    edit.mockResolvedValue({ created: 0 });

    await expect(
      generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }),
    ).rejects.toThrow("no image");
  });

  it("requires OPENAI_API_KEY", async () => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "");
    const fresh = await import("./previews");

    await expect(
      fresh.generateStoryboard({
        frames: [...frames],
        outDir: dir,
        filePrefix: "s1-take1",
      }),
    ).rejects.toThrow("OPENAI_API_KEY is not set");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("checkPreviewAvailable", () => {
  it("looks up the configured image model without rendering anything", async () => {
    retrieve.mockResolvedValue({ id: "gpt-image-2" });
    await checkPreviewAvailable();
    expect(retrieve).toHaveBeenCalledWith("gpt-image-2");

    vi.stubEnv("PREVIEW_IMAGE_MODEL", "gpt-image-2-mini");
    await checkPreviewAvailable();
    expect(retrieve).toHaveBeenLastCalledWith("gpt-image-2-mini");
    expect(generate).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("reports an unusable model or key as nothing spent", async () => {
    retrieve.mockRejectedValue(
      apiError(404, "The model `gpt-image-3` does not exist."),
    );

    const error = await checkPreviewAvailable().catch(
      (caught: unknown) => caught,
    );

    expect((error as Error).message).toBe(
      "Image previews are unavailable for this OpenAI key (404 The model `gpt-image-3` does not exist.). Nothing was spent.",
    );
    expect((error as Error).cause).toBeInstanceOf(APIError);
    expect(generate).not.toHaveBeenCalled();
  });
});
