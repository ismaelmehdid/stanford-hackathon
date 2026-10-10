import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInstagramScraper } from "./apify";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "analysis-"));
  vi.stubEnv("ANALYSIS_DATA_DIR", tempDir);
  vi.stubEnv("APIFY_TOKEN", "test-token");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("runInstagramScraper", () => {
  it("starts a capped run, polls until it finishes, reads the dataset, then serves the cache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: { id: "run1", status: "RUNNING", defaultDatasetId: "ds1" },
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "ds1" },
        }),
      )
      .mockResolvedValueOnce(json([{ shortCode: "a" }, { shortCode: "b" }]));
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      directUrls: ["https://www.instagram.com/x/"],
      resultsType: "posts",
      resultsLimit: 10,
    };
    const first = await runInstagramScraper(input, 10);
    expect(first).toEqual({
      items: [{ shortCode: "a" }, { shortCode: "b" }],
      costUsd: 2 * 0.0027,
      scrapedAt: expect.any(String),
    });
    expect(fetchMock.mock.calls[0][0]).toContain("maxItems=10");
    expect(fetchMock.mock.calls[0][0]).toContain("timeout=3600");
    expect(fetchMock.mock.calls[0][0]).toContain("maxTotalChargeUsd=0.08");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer test-token",
    );

    const second = await runInstagramScraper(input, 10);
    expect(second).toEqual({
      items: first.items,
      costUsd: 0,
      scrapedAt: first.scrapedAt,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws on a failed run and does not cache it", async () => {
    // A fresh Response per call: a body can only be read once.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        json({
          data: { id: "run2", status: "FAILED", defaultDatasetId: "ds2" },
        }),
      ),
    );
    await expect(runInstagramScraper({ q: 1 }, 1)).rejects.toThrow(
      "ended with status FAILED",
    );
    await expect(runInstagramScraper({ q: 1 }, 1)).rejects.toThrow(
      "ended with status FAILED",
    );
  });

  it("does not cache empty or error-only results", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url.includes("/datasets/")
        ? json([{ error: "restricted_page" }])
        : json({
            data: { id: "run4", status: "SUCCEEDED", defaultDatasetId: "ds4" },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await runInstagramScraper({ q: 4 }, 1);
    await runInstagramScraper({ q: 4 }, 1);
    const starts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(starts).toHaveLength(2);
  });

  it("resumes the paid run of an interrupted attempt instead of starting another", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: { id: "run3", status: "RUNNING", defaultDatasetId: "ds3" },
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: { id: "run3", status: "SUCCEEDED", defaultDatasetId: "ds3" },
        }),
      )
      .mockResolvedValueOnce(json({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(
        json({
          data: { id: "run3", status: "SUCCEEDED", defaultDatasetId: "ds3" },
        }),
      )
      .mockResolvedValueOnce(json([{ shortCode: "a" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runInstagramScraper({ q: 3 }, 1)).rejects.toThrow("503");
    const result = await runInstagramScraper({ q: 3 }, 1);
    expect(result.items).toEqual([{ shortCode: "a" }]);
    expect(fetchMock.mock.calls[3][0]).toContain("/actor-runs/run3");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });

  it("retries a failed poll instead of abandoning the run", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: { id: "run5", status: "RUNNING", defaultDatasetId: "ds5" },
        }),
      )
      .mockResolvedValueOnce(json({ error: "bad gateway" }, 502))
      .mockResolvedValueOnce(
        json({
          data: { id: "run5", status: "SUCCEEDED", defaultDatasetId: "ds5" },
        }),
      )
      .mockResolvedValueOnce(json([{ shortCode: "a" }]));
    vi.stubGlobal("fetch", fetchMock);

    let settled = false;
    const promise = runInstagramScraper({ q: 5 }, 1).finally(() => {
      settled = true;
    });
    while (!settled) {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect((await promise).items).toEqual([{ shortCode: "a" }]);
    vi.useRealTimers();
  });
});
