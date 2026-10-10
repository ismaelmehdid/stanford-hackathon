import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const retrieve = vi.fn();
const downloadContent = vi.fn();
const list = vi.fn();
vi.mock("openai", () => ({
  default: class {
    videos = { create, retrieve, downloadContent, list };
  },
}));

const { checkSoraAvailable, generateTake, SoraUnavailableError } =
  await import("./sora");

// Shaped like the SDK's APIError: a message plus the HTTP status.
const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const video = (status: string, error: unknown = null) => ({
  id: "video_123",
  status,
  error,
});

let dir: string;

beforeEach(async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("SORA_MODEL", "");
  dir = await mkdtemp(path.join(os.tmpdir(), "sora-"));
});

afterEach(async () => {
  create.mockReset();
  retrieve.mockReset();
  downloadContent.mockReset();
  list.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("generateTake", () => {
  it("polls until completed, then writes the video bytes", async () => {
    create.mockResolvedValue(video("queued"));
    retrieve
      .mockResolvedValueOnce(video("in_progress"))
      .mockResolvedValueOnce(video("completed"));
    downloadContent.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const onStarted = vi.fn();
    const outPath = path.join(dir, "nested", "s1-take1.mp4");

    const result = await generateTake({
      prompt: "A woman in her 30s shows her sleek low bun.",
      seconds: 8,
      outPath,
      onStarted,
      pollMs: 0,
    });

    expect(result).toEqual({ videoId: "video_123" });
    // A retried create could start a second paid render, so the SDK must never retry it.
    expect(create).toHaveBeenCalledWith(
      {
        model: "sora-2",
        prompt: "A woman in her 30s shows her sleek low bun.",
        seconds: "8",
        size: "720x1280",
      },
      { maxRetries: 0 },
    );
    expect(onStarted).toHaveBeenCalledWith("video_123");
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(retrieve).toHaveBeenCalledWith("video_123");
    expect(downloadContent).toHaveBeenCalledWith("video_123");
    expect([...(await readFile(outPath))]).toEqual([1, 2, 3]);
    expect(await readdir(path.dirname(outPath))).toEqual(["s1-take1.mp4"]);
  });

  it("uses SORA_MODEL when set", async () => {
    vi.stubEnv("SORA_MODEL", "sora-2-pro");
    create.mockResolvedValue(video("completed"));
    downloadContent.mockResolvedValue(new Response(new Uint8Array([9])));

    await generateTake({
      prompt: "p",
      seconds: 4,
      outPath: path.join(dir, "s1-take1.mp4"),
      pollMs: 0,
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      model: "sora-2-pro",
      seconds: "4",
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("throws with the Sora error message when the render fails", async () => {
    create.mockResolvedValue(video("queued"));
    retrieve.mockResolvedValue(
      video("failed", {
        code: "moderation_blocked",
        message: "The prompt was blocked by moderation.",
      }),
    );
    const onStarted = vi.fn();
    const outPath = path.join(dir, "s1-take1.mp4");

    await expect(
      generateTake({ prompt: "p", seconds: 8, outPath, onStarted, pollMs: 0 }),
    ).rejects.toThrow(
      "Sora render failed: The prompt was blocked by moderation.",
    );
    expect(onStarted).toHaveBeenCalledWith("video_123");
    expect(downloadContent).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it("falls back to the status when a failed render has no error message", async () => {
    create.mockResolvedValue(video("failed"));

    await expect(
      generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        pollMs: 0,
      }),
    ).rejects.toThrow("Sora render failed: failed");
  });

  it("propagates a rejected create call without calling onStarted", async () => {
    create.mockRejectedValue(new Error("400 Your request was blocked."));
    const onStarted = vi.fn();

    await expect(
      generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        onStarted,
        pollMs: 0,
      }),
    ).rejects.toThrow("400 Your request was blocked.");
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("reports an unavailable model or key as SoraUnavailableError", async () => {
    for (const status of [401, 403, 404, 410]) {
      create.mockRejectedValueOnce(apiError(status, `${status} No access.`));
      const error = await generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        pollMs: 0,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SoraUnavailableError);
      expect((error as Error).message).toBe(
        `Sora is unavailable: ${status} No access.`,
      );
    }

    create.mockRejectedValueOnce(apiError(400, "400 Moderation blocked."));
    const moderated = await generateTake({
      prompt: "p",
      seconds: 8,
      outPath: path.join(dir, "s1-take1.mp4"),
      pollMs: 0,
    }).catch((caught: unknown) => caught);
    expect(moderated).not.toBeInstanceOf(SoraUnavailableError);
  });

  it("keeps polling through a dropped connection while the paid render runs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockResolvedValue(video("queued"));
    retrieve
      .mockRejectedValueOnce(new Error("Connection error."))
      .mockRejectedValueOnce(apiError(502, "502 Bad gateway"))
      .mockResolvedValueOnce(video("completed"));
    downloadContent.mockResolvedValue(new Response(new Uint8Array([7])));
    const outPath = path.join(dir, "s1-take1.mp4");

    await expect(
      generateTake({ prompt: "p", seconds: 8, outPath, pollMs: 0 }),
    ).resolves.toEqual({ videoId: "video_123" });
    expect(retrieve).toHaveBeenCalledTimes(3);
    expect([...(await readFile(outPath))]).toEqual([7]);
  });

  it("stops polling on a definite API answer such as 404", async () => {
    create.mockResolvedValue(video("queued"));
    retrieve.mockRejectedValue(apiError(404, "404 Video not found."));

    await expect(
      generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        pollMs: 0,
      }),
    ).rejects.toThrow("404 Video not found.");
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("retries a failed download of a finished render", async () => {
    create.mockResolvedValue(video("completed"));
    downloadContent
      .mockRejectedValueOnce(new Error("Connection error."))
      .mockResolvedValueOnce(new Response(new Uint8Array([5])));
    const outPath = path.join(dir, "s1-take1.mp4");

    await generateTake({ prompt: "p", seconds: 8, outPath, pollMs: 0 });

    expect(downloadContent).toHaveBeenCalledTimes(2);
    expect([...(await readFile(outPath))]).toEqual([5]);
  });

  it("gives up on the download after three attempts", async () => {
    create.mockResolvedValue(video("completed"));
    downloadContent.mockRejectedValue(new Error("Connection error."));

    await expect(
      generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        pollMs: 0,
      }),
    ).rejects.toThrow("Connection error.");
    expect(downloadContent).toHaveBeenCalledTimes(3);
    expect(await readdir(dir)).toEqual([]);
  });

  it("gives up when the render never finishes", async () => {
    create.mockResolvedValue(video("queued"));
    retrieve.mockResolvedValue(video("in_progress"));

    await expect(
      generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        pollMs: 0,
        timeoutMs: 0,
      }),
    ).rejects.toThrow("Sora render timed out");
    expect(downloadContent).not.toHaveBeenCalled();
  });

  it("requires OPENAI_API_KEY", async () => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "");
    const fresh = await import("./sora");

    await expect(
      fresh.generateTake({
        prompt: "p",
        seconds: 8,
        outPath: path.join(dir, "s1-take1.mp4"),
        pollMs: 0,
      }),
    ).rejects.toThrow("OPENAI_API_KEY is not set");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("checkSoraAvailable", () => {
  it("lists one video, which starts no render", async () => {
    list.mockResolvedValue({ data: [] });

    await expect(checkSoraAvailable()).resolves.toBeUndefined();
    expect(list).toHaveBeenCalledWith({ limit: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it("throws a clear error when the Sora API refuses the key", async () => {
    list.mockRejectedValue(apiError(404, "404 Not found."));

    await expect(checkSoraAvailable()).rejects.toThrow(
      "Sora is unavailable for this OpenAI key (404 Not found.). Nothing was spent.",
    );
  });
});
