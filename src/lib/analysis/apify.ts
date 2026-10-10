import { rm } from "node:fs/promises";
import { hashKey, paths, readJson, writeJson } from "./cache";
import { APIFY_PRICE_PER_RESULT_USD, requireEnv } from "./config";
import type { ApifyPostItem, ApifyProfileItem } from "./instagram";

const API = "https://api.apify.com/v2";
const ACTOR = "apify~instagram-scraper";
const UNFINISHED = new Set(["READY", "RUNNING", "TIMING-OUT", "ABORTING"]);
// Apify aborts the actor after this, so a stuck scrape cannot keep a run "running" forever.
const RUN_TIMEOUT_SECONDS = 3600;
const POLL_ATTEMPTS = 4;

type ApifyRun = {
  id: string;
  status: string;
  defaultDatasetId: string;
  finishedAt?: string | null;
};

// scrapedAt is when the metrics were read, which video age must be measured against.
type CachedScrape<T> = { scrapedAt: string; items: T[] };

export type ScrapeResult<T> = {
  items: T[];
  costUsd: number;
  scrapedAt: string;
};

export const profileUrl = (username: string) =>
  `https://www.instagram.com/${username}/`;

async function apifyFetch<T>(
  pathAndQuery: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(
      `Apify ${pathAndQuery.split("?")[0]} failed (${response.status}): ${body}`,
    );
  }
  return (await response.json()) as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One failed poll must not throw away a paid run that is still going.
async function pollRun(runId: string): Promise<ApifyRun> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { data } = await apifyFetch<{ data: ApifyRun }>(
        `/actor-runs/${runId}?waitForFinish=60`,
      );
      return data;
    } catch (error) {
      if (attempt >= POLL_ATTEMPTS) throw error;
      await sleep(attempt * 5000);
    }
  }
}

// Reuses the run an interrupted attempt started (restart, network error) so it is not paid for twice.
async function startOrResumeRun(
  input: Record<string, unknown>,
  maxItems: number,
  runFile: string,
): Promise<ApifyRun> {
  const pending = await readJson<{ runId: string }>(runFile);
  if (pending) {
    const run = await apifyFetch<{ data: ApifyRun }>(
      `/actor-runs/${pending.runId}`,
    ).then(
      ({ data }) => data,
      () => null,
    );
    if (run && (UNFINISHED.has(run.status) || run.status === "SUCCEEDED"))
      return run;
  }
  const params = new URLSearchParams({
    maxItems: String(maxItems),
    maxTotalChargeUsd: (maxItems * APIFY_PRICE_PER_RESULT_USD + 0.05).toFixed(
      2,
    ),
    timeout: String(RUN_TIMEOUT_SECONDS),
  });
  const { data: run } = await apifyFetch<{ data: ApifyRun }>(
    `/acts/${ACTOR}/runs?${params}`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  await writeJson(runFile, { runId: run.id });
  return run;
}

// Runs the actor asynchronously (scrapes can exceed the 5-minute sync limit) and caches the items by input.
export async function runInstagramScraper<T extends { error?: string }>(
  input: Record<string, unknown>,
  maxItems: number,
): Promise<ScrapeResult<T>> {
  const key = hashKey(input);
  const cacheFile = paths.apifyCache(key);
  const cached = await readJson<CachedScrape<T>>(cacheFile);
  if (cached)
    return { items: cached.items, costUsd: 0, scrapedAt: cached.scrapedAt };

  const runFile = paths.apifyCache(`${key}.run`);
  let run = await startOrResumeRun(input, maxItems, runFile);
  while (UNFINISHED.has(run.status)) run = await pollRun(run.id);
  if (run.status !== "SUCCEEDED") {
    await rm(runFile, { force: true });
    throw new Error(`Apify run ${run.id} ended with status ${run.status}`);
  }
  const items = await apifyFetch<T[]>(
    `/datasets/${run.defaultDatasetId}/items?clean=true&format=json`,
  );
  const scrapedAt = run.finishedAt ?? new Date().toISOString();
  // Empty or error-only results are often temporary (rate limit, private profile made public); scrape again next time.
  if (items.some((item) => !item.error))
    await writeJson(cacheFile, { scrapedAt, items });
  await rm(runFile, { force: true });
  return {
    items,
    costUsd: items.length * APIFY_PRICE_PER_RESULT_USD,
    scrapedAt,
  };
}

export const scrapeProfileDetails = (username: string) =>
  runInstagramScraper<ApifyProfileItem>(
    { directUrls: [profileUrl(username)], resultsType: "details" },
    1,
  );

export const scrapeProfilePosts = (
  usernames: string[],
  postsPerProfile: number,
) =>
  runInstagramScraper<ApifyPostItem>(
    {
      directUrls: usernames.map(profileUrl),
      resultsType: "posts",
      resultsLimit: postsPerProfile,
      addParentData: false,
    },
    usernames.length * postsPerProfile,
  );
