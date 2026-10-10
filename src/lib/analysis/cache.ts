import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const dataDir = () =>
  process.env.ANALYSIS_DATA_DIR || path.join(process.cwd(), ".data");

export const paths = {
  run: (runId: string) => path.join(dataDir(), "runs", runId),
  apifyCache: (key: string) =>
    path.join(dataDir(), "cache", "apify", `${key}.json`),
  media: (shortCode: string) =>
    path.join(dataDir(), "cache", "media", shortCode),
  ai: (shortCode: string, stage: string, version: number) =>
    path.join(
      dataDir(),
      "cache",
      "ai",
      `${shortCode}.${stage}.v${version}.json`,
    ),
};

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Write to a temp file, then rename, so readers never see a half-written file.
export async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2));
  await rename(temp, file);
}

export async function cachedJson<T>(
  file: string,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await readJson<T>(file);
  if (hit !== null) return hit;
  const value = await compute();
  await writeJson(file, value);
  return value;
}

export const hashKey = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
