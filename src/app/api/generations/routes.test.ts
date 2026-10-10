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
const imageRoute = await import("./[generationId]/images/[file]/route");

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
  it("returns the sources and the default image quality", async () => {
    vi.mocked(sources.listSources).mockResolvedValue([
      {
        id: "sample:headandshoulders",
        label: "Sample",
        brand: "headandshoulders",
        createdAt: null,
        briefs: [],
      },
    ]);
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "");
    const response = await sourcesRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sources: [expect.objectContaining({ id: "sample:headandshoulders" })],
      imageQuality: "medium",
    });
    vi.unstubAllEnvs();
  });

  // The browser cannot read PREVIEW_IMAGE_QUALITY, so the start form prices images with this value.
  it("reports the configured image quality, or null when it is not supported", async () => {
    vi.mocked(sources.listSources).mockResolvedValue([]);
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "high");
    expect(await (await sourcesRoute.GET()).json()).toMatchObject({
      imageQuality: "high",
    });
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "ultra");
    expect(await (await sourcesRoute.GET()).json()).toMatchObject({
      imageQuality: null,
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
      new Error("This would create 90 images (≈ $3.15). The limit is 60."),
    );
    const response = await generationsRoute.POST(
      jsonRequest("/api/generations", { sourceId: "sample:headandshoulders" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This would create 90 images (≈ $3.15). The limit is 60.",
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

describe("GET /api/generations/[generationId]/images/[file]", () => {
  let dataDir: string;
  const previousDataDir = process.env.ANALYSIS_DATA_DIR;
  const bytes = Buffer.from(Array.from({ length: 100 }, (_, i) => i));

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "generation-routes-"));
    process.env.ANALYSIS_DATA_DIR = dataDir;
    const dir = path.join(dataDir, "generations", "gen-1");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "s1-take1-f1.jpg"), bytes);
    await writeFile(path.join(dir, "s1-take1.mp4"), bytes);
    await writeFile(path.join(dir, "generation.json"), "{}");
    // A directory with a valid frame name must not be served.
    await mkdir(path.join(dir, "s1-take1-f3.jpg"));
    // A frame-named file next to the generation dir must never be reachable from it.
    await writeFile(
      path.join(dataDir, "generations", "s1-take1-f2.jpg"),
      bytes,
    );
  });

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.ANALYSIS_DATA_DIR;
    else process.env.ANALYSIS_DATA_DIR = previousDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });

  const image = (generationId: string, file: string) =>
    imageRoute.GET(
      new Request(`${ORIGIN}/api/generations/${generationId}/images/${file}`),
      params({ generationId, file }),
    );

  it("serves a storyboard frame as a privately cached JPEG", async () => {
    const response = await image("gen-1", "s1-take1-f1.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(response.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each([
    ["..", "s1-take1-f1.jpg"],
    ["gen-1/..", "s1-take1-f2.jpg"],
    ["gen-1", "../s1-take1-f2.jpg"],
    ["gen-1", "../gen-1/s1-take1-f1.jpg"],
    ["gen-1", "..%2Fs1-take1-f2.jpg"],
    ["gen-1", "generation.json"],
    ["gen-1", "s1-take1.mp4"],
    ["gen-1", "s1-take1-f4.jpg"],
  ])("returns 404 for the invalid path %s/%s", async (generationId, file) => {
    const response = await image(generationId, file);
    expect(response.status).toBe(404);
  });

  it.each([
    ["gen-1", "s2-take1-f1.jpg"],
    ["gen-1", "s1-take1-f3.jpg"],
    ["missing", "s1-take1-f1.jpg"],
  ])("returns 404 when %s/%s is not a file", async (generationId, file) => {
    const response = await image(generationId, file);
    expect(response.status).toBe(404);
  });
});
