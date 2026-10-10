import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { GenerationState } from "@/lib/generation/schema";

vi.mock("@/lib/generation/sources", () => ({
  listSources: vi.fn(),
  loadAnalysis: vi.fn(),
}));
// Keep the real id/file validators and generationDir; mock everything that runs or stores a job.
vi.mock("@/lib/generation/generations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generation/generations")>()),
  createGeneration: vi.fn(),
  startGeneration: vi.fn(),
  getGeneration: vi.fn(),
  listGenerations: vi.fn(),
  pickTake: vi.fn(),
}));

const sources = await import("@/lib/generation/sources");
const generations = await import("@/lib/generation/generations");
const sourcesRoute = await import("../generation-sources/route");
const generationsRoute = await import("./route");
const generationRoute = await import("./[generationId]/route");
const pickRoute = await import("./[generationId]/pick/route");
const videoRoute = await import("./[generationId]/videos/[file]/route");

const ORIGIN = "http://localhost:3000";
const fakeGeneration = { id: "gen-1", status: "queued" } as GenerationState;

function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${ORIGIN}${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3000",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = <T extends Record<string, string>>(value: T) => ({
  params: Promise.resolve(value),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/generation-sources", () => {
  it("returns the sources", async () => {
    vi.mocked(sources.listSources).mockResolvedValue([
      {
        id: "sample:headandshoulders",
        label: "Sample",
        brand: "headandshoulders",
        createdAt: null,
        briefs: [],
      },
    ]);
    vi.stubEnv("SORA_MODEL", "");
    const response = await sourcesRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sources: [expect.objectContaining({ id: "sample:headandshoulders" })],
      soraPricePerSecondUsd: 0.1,
    });
    vi.unstubAllEnvs();
  });

  // The browser cannot read SORA_MODEL, so the start form prices takes with this value.
  it("reports the price of the configured Sora model, or null when unknown", async () => {
    vi.mocked(sources.listSources).mockResolvedValue([]);
    vi.stubEnv("SORA_MODEL", "sora-2-pro");
    expect(await (await sourcesRoute.GET()).json()).toMatchObject({
      soraPricePerSecondUsd: 0.3,
    });
    vi.stubEnv("SORA_MODEL", "sora-9");
    expect(await (await sourcesRoute.GET()).json()).toMatchObject({
      soraPricePerSecondUsd: null,
    });
    vi.unstubAllEnvs();
  });
});

describe("GET /api/generations", () => {
  it("returns the generations", async () => {
    vi.mocked(generations.listGenerations).mockResolvedValue([fakeGeneration]);
    const response = await generationsRoute.GET();
    expect(await response.json()).toEqual({ generations: [fakeGeneration] });
  });
});

describe("POST /api/generations", () => {
  it("refuses cross-site and non-JSON requests before creating anything", async () => {
    const crossSite = await generationsRoute.POST(
      jsonRequest(
        "/api/generations",
        { sourceId: "sample:headandshoulders" },
        { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      ),
    );
    const notJson = await generationsRoute.POST(
      jsonRequest(
        "/api/generations",
        { sourceId: "sample:headandshoulders" },
        { "content-type": "text/plain" },
      ),
    );
    expect(crossSite.status).toBe(403);
    expect(notJson.status).toBe(403);
    expect(generations.createGeneration).not.toHaveBeenCalled();
  });

  it("rejects a missing sourceId or malformed briefIndexes with 400", async () => {
    const missing = await generationsRoute.POST(
      jsonRequest("/api/generations", { settings: {} }),
    );
    const badJson = await generationsRoute.POST(
      jsonRequest("/api/generations", "{not json"),
    );
    const badIndexes = await generationsRoute.POST(
      jsonRequest("/api/generations", {
        sourceId: "sample:headandshoulders",
        briefIndexes: [0, "1"],
      }),
    );
    expect(missing.status).toBe(400);
    expect(badJson.status).toBe(400);
    expect(badIndexes.status).toBe(400);
    expect(await badIndexes.json()).toEqual({ error: expect.any(String) });
    expect(generations.createGeneration).not.toHaveBeenCalled();
  });

  it("creates and starts a generation with 201", async () => {
    vi.mocked(generations.createGeneration).mockResolvedValue(fakeGeneration);
    const response = await generationsRoute.POST(
      jsonRequest("/api/generations", {
        sourceId: "sample:headandshoulders",
        briefIndexes: [0, 2],
        settings: { takesPerScript: 1 },
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ generation: fakeGeneration });
    expect(generations.createGeneration).toHaveBeenCalledWith({
      sourceId: "sample:headandshoulders",
      briefIndexes: [0, 2],
      settings: { takesPerScript: 1 },
    });
    expect(generations.startGeneration).toHaveBeenCalledWith(fakeGeneration);
  });

  it("passes no brief selection or settings when they are omitted", async () => {
    vi.mocked(generations.createGeneration).mockResolvedValue(fakeGeneration);
    await generationsRoute.POST(
      jsonRequest("/api/generations", {
        sourceId: "sample:headandshoulders",
        settings: "cheap",
      }),
    );
    expect(generations.createGeneration).toHaveBeenCalledWith({
      sourceId: "sample:headandshoulders",
      briefIndexes: null,
      settings: {},
    });
  });

  it("maps a rejected request (e.g. over the cap) to 400 without starting it", async () => {
    vi.mocked(generations.createGeneration).mockRejectedValue(
      new Error(
        "This would render 540 s of video (≈ $54.00). The limit is 120 s.",
      ),
    );
    const response = await generationsRoute.POST(
      jsonRequest("/api/generations", { sourceId: "sample:headandshoulders" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This would render 540 s of video (≈ $54.00). The limit is 120 s.",
    });
    expect(generations.startGeneration).not.toHaveBeenCalled();
  });
});

describe("GET /api/generations/[generationId]", () => {
  it("returns the generation or 404", async () => {
    vi.mocked(generations.getGeneration).mockResolvedValueOnce(fakeGeneration);
    const found = await generationRoute.GET(
      new Request(`${ORIGIN}/api/generations/gen-1`),
      params({ generationId: "gen-1" }),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ generation: fakeGeneration });

    vi.mocked(generations.getGeneration).mockResolvedValueOnce(null);
    const missing = await generationRoute.GET(
      new Request(`${ORIGIN}/api/generations/nope`),
      params({ generationId: "nope" }),
    );
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/generations/[generationId]/pick", () => {
  const pick = (
    generationId: string,
    body: unknown,
    headers?: Record<string, string>,
  ) =>
    pickRoute.POST(
      jsonRequest(`/api/generations/${generationId}/pick`, body, headers),
      params({ generationId }),
    );

  it("refuses cross-site requests", async () => {
    const response = await pick(
      "gen-1",
      { scriptId: "s1", takeIndex: 1 },
      { "sec-fetch-site": "cross-site" },
    );
    expect(response.status).toBe(403);
    expect(generations.pickTake).not.toHaveBeenCalled();
  });

  it("returns 404 for an invalid id without touching the store", async () => {
    const response = await pick("..", { scriptId: "s1", takeIndex: 1 });
    expect(response.status).toBe(404);
    expect(generations.pickTake).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const response = await pick("gen-1", { scriptId: "s1", takeIndex: "1" });
    expect(response.status).toBe(400);
    expect(generations.pickTake).not.toHaveBeenCalled();
  });

  it("returns 404 when the generation does not exist", async () => {
    vi.mocked(generations.pickTake).mockResolvedValue(null);
    const response = await pick("gen-1", { scriptId: "s1", takeIndex: 1 });
    expect(response.status).toBe(404);
  });

  it("maps an unknown script or unfinished take to 400", async () => {
    vi.mocked(generations.pickTake).mockRejectedValue(
      new Error("Only a finished take can be picked."),
    );
    const response = await pick("gen-1", { scriptId: "s1", takeIndex: 2 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Only a finished take can be picked.",
    });
  });

  it("records the pick", async () => {
    vi.mocked(generations.pickTake).mockResolvedValue(fakeGeneration);
    const response = await pick("gen-1", { scriptId: "s1", takeIndex: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ generation: fakeGeneration });
    expect(generations.pickTake).toHaveBeenCalledWith("gen-1", "s1", 2);
  });
});

describe("GET /api/generations/[generationId]/videos/[file]", () => {
  let dataDir: string;
  const previousDataDir = process.env.ANALYSIS_DATA_DIR;
  const bytes = Buffer.from(Array.from({ length: 100 }, (_, i) => i));

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "generation-routes-"));
    process.env.ANALYSIS_DATA_DIR = dataDir;
    const dir = path.join(dataDir, "generations", "gen-1");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "s1-take1.mp4"), bytes);
    await writeFile(path.join(dir, "generation.json"), "{}");
  });

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.ANALYSIS_DATA_DIR;
    else process.env.ANALYSIS_DATA_DIR = previousDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });

  const video = (
    generationId: string,
    file: string,
    headers: Record<string, string> = {},
  ) =>
    videoRoute.GET(
      new Request(`${ORIGIN}/api/generations/${generationId}/videos/${file}`, {
        headers,
      }),
      params({ generationId, file }),
    );

  it("serves the whole file with range support advertised", async () => {
    const response = await video("gen-1", "s1-take1.mp4");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each([
    ["bytes=10-19", 10, 19],
    ["bytes=90-", 90, 99],
    ["bytes=-5", 95, 99],
    ["bytes=50-1000", 50, 99],
    ["bytes=0-0", 0, 0],
  ])("serves %s as 206 partial content", async (range, start, end) => {
    const response = await video("gen-1", "s1-take1.mp4", { range });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(
      `bytes ${start}-${end}/100`,
    );
    expect(response.headers.get("content-length")).toBe(
      String(end - start + 1),
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(start, end + 1),
    );
  });

  it.each(["bytes=100-", "bytes=200-300", "bytes=-0", "bytes=20-10"])(
    "answers the unsatisfiable range %s with 416",
    async (range) => {
      const response = await video("gen-1", "s1-take1.mp4", { range });
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */100");
    },
  );

  it("ignores a Range header it does not understand", async () => {
    const response = await video("gen-1", "s1-take1.mp4", {
      range: "items=0-5",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("100");
    await response.arrayBuffer();
  });

  it.each([
    ["..", "s1-take1.mp4"],
    ["gen-1", "generation.json"],
    ["gen-1", "../gen-1/s1-take1.mp4"],
    ["gen-1", "s2-take1.mp4"],
    ["missing", "s1-take1.mp4"],
  ])("returns 404 for %s/%s", async (generationId, file) => {
    const response = await video(generationId, file);
    expect(response.status).toBe(404);
  });
});
