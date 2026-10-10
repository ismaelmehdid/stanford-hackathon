import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJson } from "@/lib/analysis/cache";
import type { BrandAnalysis } from "@/lib/analysis/schema";
import { listSources, loadAnalysis } from "./sources";

let tempDir: string;
let sample: BrandAnalysis;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "sources-"));
  vi.stubEnv("ANALYSIS_DATA_DIR", tempDir);
  sample = JSON.parse(
    await readFile(
      path.join(process.cwd(), "samples", "headandshoulders.analysis.json"),
      "utf8",
    ),
  ) as BrandAnalysis;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

async function writeRun(
  id: string,
  status: "completed" | "failed",
  createdAt: string,
  analysis: BrandAnalysis | null,
) {
  const dir = path.join(tempDir, "runs", id);
  await writeJson(path.join(dir, "run.json"), {
    id,
    brandUsername: analysis?.brand.username ?? "brand",
    brandUrl: "https://www.instagram.com/brand/",
    settings: { brandPostLimit: 1, maxCreators: 1, creatorPostLimit: 1 },
    status,
    createdAt,
    updatedAt: createdAt,
    error: null,
    stages: {},
    videos: [],
    apifySpendUsd: 0,
  });
  if (analysis) await writeJson(path.join(dir, "analysis.json"), analysis);
}

describe("generation sources", () => {
  it("lists the committed sample with its three briefs", async () => {
    const sources = await listSources();
    const source = sources.find((s) => s.id === "sample:headandshoulders");
    expect(source).toMatchObject({
      brand: "headandshoulders",
      createdAt: null,
    });
    expect(source?.label).toMatch(/sample/i);
    expect(source?.briefs).toHaveLength(3);
    expect(source?.briefs[0]).toEqual({
      index: 0,
      format: sample.conclusions!.replicationBriefs[0].format,
      hook: sample.conclusions!.replicationBriefs[0].hook,
      hairstyleVariations:
        sample.conclusions!.replicationBriefs[0].hairstyleVariations,
    });
    expect(source?.briefs.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it("lists completed runs newest first and skips unusable ones", async () => {
    const other = { ...sample, brand: { ...sample.brand, username: "dove" } };
    await writeRun(
      "dove-20261009-100000",
      "completed",
      "2026-10-09T10:00:00Z",
      other,
    );
    await writeRun(
      "dove-20261010-100000",
      "completed",
      "2026-10-10T10:00:00Z",
      other,
    );
    await writeRun(
      "dove-20261010-110000",
      "failed",
      "2026-10-10T11:00:00Z",
      other,
    );
    await writeRun(
      "dove-20261010-120000",
      "completed",
      "2026-10-10T12:00:00Z",
      {
        ...other,
        conclusions: null,
      },
    );
    await writeRun(
      "dove-20261010-130000",
      "completed",
      "2026-10-10T13:00:00Z",
      {
        ...other,
        conclusions: { ...other.conclusions!, replicationBriefs: [] },
      },
    );
    await writeRun(
      "dove-20261010-140000",
      "completed",
      "2026-10-10T14:00:00Z",
      {
        ...other,
        schemaVersion: 2,
      } as unknown as BrandAnalysis,
    );

    const sources = await listSources();
    const runs = sources.filter((s) => s.id.startsWith("run:"));
    expect(runs.map((s) => s.id)).toEqual([
      "run:dove-20261010-100000",
      "run:dove-20261009-100000",
    ]);
    expect(runs[0]).toMatchObject({
      brand: "dove",
      createdAt: "2026-10-10T10:00:00Z",
    });
    expect(runs[0].briefs).toHaveLength(3);
    expect(sources.some((s) => s.id === "sample:headandshoulders")).toBe(true);
  });

  it("loads the sample and completed runs as validated analyses", async () => {
    const other = { ...sample, brand: { ...sample.brand, username: "dove" } };
    await writeRun(
      "dove-20261010-100000",
      "completed",
      "2026-10-10T10:00:00Z",
      other,
    );

    const fromSample = await loadAnalysis("sample:headandshoulders");
    expect(fromSample.brand.username).toBe("headandshoulders");
    expect(fromSample.conclusions?.replicationBriefs).toHaveLength(3);

    const fromRun = await loadAnalysis("run:dove-20261010-100000");
    expect(fromRun.brand.username).toBe("dove");
  });

  it("rejects unknown, unfinished and traversal source ids", async () => {
    await writeRun(
      "dove-20261010-110000",
      "failed",
      "2026-10-10T11:00:00Z",
      sample,
    );
    await writeRun(
      "dove-20261010-120000",
      "completed",
      "2026-10-10T12:00:00Z",
      {
        ...sample,
        conclusions: null,
      },
    );

    for (const id of [
      "",
      "headandshoulders",
      "sample:unknown",
      "sample:__proto__",
      "sample:../samples/headandshoulders",
      "run:missing-20261010-000000",
      "run:../../etc/passwd",
      "run:..",
      "run:dove-20261010-110000",
      "run:dove-20261010-120000",
      "other:headandshoulders",
    ]) {
      await expect(loadAnalysis(id), id).rejects.toThrow("Unknown source.");
    }
  });
});
