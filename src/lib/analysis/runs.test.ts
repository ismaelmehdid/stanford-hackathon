import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJson } from "./cache";
import { createRun, getRun, isValidRunId, listRuns } from "./runs";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "runs-"));
  vi.stubEnv("ANALYSIS_DATA_DIR", tempDir);
  vi.stubEnv("APIFY_TOKEN", "x");
  vi.stubEnv("OPENAI_API_KEY", "y");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe("runs", () => {
  it("rejects path traversal in run ids", async () => {
    expect(isValidRunId("headandshoulders-20261010-014512")).toBe(true);
    expect(isValidRunId("../secrets")).toBe(false);
    expect(await getRun("../secrets")).toBeNull();
  });

  it("creates a queued run with clamped settings", async () => {
    const { run, created } = await createRun(
      "https://www.instagram.com/headandshoulders",
      { maxCreators: 99 },
    );
    expect(created).toBe(true);
    expect(run).toMatchObject({
      brandUsername: "headandshoulders",
      status: "queued",
    });
    expect(run.settings.maxCreators).toBe(25);
    expect(run.id).toMatch(/^headandshoulders-\d{8}-\d{6}$/);
  });

  it("reports a run left unfinished by a stopped server as failed", async () => {
    const { run } = await createRun("headandshoulders");
    const stored = await getRun(run.id);
    expect(stored?.run.status).toBe("failed");
    expect(stored?.run.error).toMatch(/server stopped/i);
    expect((await listRuns())[0].status).toBe("failed");
  });

  it("treats a run that another live process is executing as active", async () => {
    const { run } = await createRun("headandshoulders");
    // The CLI runs in its own process: here, the parent of the test worker.
    await writeJson(path.join(tempDir, "runs", run.id, "run.json"), {
      ...run,
      status: "running",
      pid: process.ppid,
      updatedAt: new Date().toISOString(),
    });
    expect((await getRun(run.id))?.run.status).toBe("running");
    const again = await createRun("https://www.instagram.com/headandshoulders");
    expect(again).toMatchObject({ created: false, run: { id: run.id } });
  });

  it("reports a run whose process died or stopped saving as failed", async () => {
    const { run } = await createRun("headandshoulders");
    const file = path.join(tempDir, "runs", run.id, "run.json");
    const deadPid = spawnSync("true").pid;
    await writeJson(file, { ...run, status: "running", pid: deadPid });
    expect((await getRun(run.id))?.run.status).toBe("failed");
    await writeJson(file, {
      ...run,
      status: "running",
      pid: process.ppid,
      updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect((await getRun(run.id))?.run.status).toBe("failed");
  });

  it("rejects invalid brand input and missing keys", async () => {
    await expect(createRun("not a url!")).rejects.toThrow("valid Instagram");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(createRun("headandshoulders")).rejects.toThrow(
      "OPENAI_API_KEY is not set",
    );
  });
});
