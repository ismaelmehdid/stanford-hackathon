"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  STAGE_LABELS,
  STAGES,
  type AnalyzedVideo,
  type BrandAnalysis,
  type RunState,
  type Tier,
} from "@/lib/analysis/schema";
import { ConclusionsPanel } from "./conclusions-panel";
import { VideoCard } from "./video-card";

type RunResponse = { run: RunState; analysis: BrandAnalysis | null };

const STATUS_ICON = {
  pending: "○",
  running: "◐",
  done: "●",
  failed: "✕",
} as const;

const TIER_SECTIONS: { tier: Tier; title: string; description: string }[] = [
  {
    tier: "amplify",
    title: "Amplify",
    description: "Beat both the brand page and the creator's page.",
  },
  {
    tier: "observe",
    title: "Observe",
    description: "Beat only one of the two pages.",
  },
  { tier: "stop", title: "Stop", description: "Below both pages." },
];

export function RunView({ runId }: { runId: string }) {
  const [data, setData] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error ?? "Run not found.");
          return;
        }
        setData(body);
        if (body.run.status === "queued" || body.run.status === "running")
          timer = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  if (error) return <p className="text-red-600 dark:text-red-400">{error}</p>;
  if (!data) return <p className="text-zinc-500">Loading run…</p>;
  const { run, analysis } = data;
  const analyzed = run.videos.filter(
    (video) => video.status === "analyzed" || video.status === "failed",
  ).length;
  const toAnalyze = run.videos.filter(
    (video) => video.status !== "skipped",
  ).length;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/analyze"
          className="self-start text-sm text-zinc-500 hover:underline"
        >
          ← All runs
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight break-all">
          @{run.brandUsername}
        </h1>
        <p className="text-sm text-zinc-500">
          {run.status} · Apify ≈ ${run.apifySpendUsd.toFixed(2)} · started{" "}
          {new Date(run.createdAt).toLocaleString()}
        </p>
        {run.error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-red-700 dark:bg-red-950 dark:text-red-300">
            {run.error}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-1">
        {STAGES.map((name) => {
          const stage = run.stages[name];
          return (
            <p
              key={name}
              className={
                stage.status === "failed"
                  ? "text-red-600 dark:text-red-400"
                  : undefined
              }
            >
              <span className="inline-block w-6">
                {STATUS_ICON[stage.status]}
              </span>
              {STAGE_LABELS[name]}
              {name === "analyzeVideos" &&
                toAnalyze > 0 &&
                stage.status === "running" &&
                ` (${analyzed}/${toAnalyze})`}
              {stage.detail && (
                <span className="text-zinc-500"> — {stage.detail}</span>
              )}
            </p>
          );
        })}
      </section>

      {analysis && <Results runId={run.id} analysis={analysis} />}
    </div>
  );
}

function Results({
  runId,
  analysis,
}: {
  runId: string;
  analysis: BrandAnalysis;
}) {
  const byTier = (tier: Tier) =>
    analysis.videos.filter((video) => video.tier === tier);
  const unscored = analysis.videos.filter(
    (video) =>
      video.tier === "insufficient_data" || video.tier === "too_recent",
  );
  return (
    <div className="flex flex-col gap-10">
      <a
        href={`/api/runs/${runId}/analysis`}
        className="self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Download JSON for video generation
      </a>
      {analysis.conclusions && (
        <ConclusionsPanel conclusions={analysis.conclusions} />
      )}
      {analysis.videos.length === 0 && (
        <p className="text-zinc-500">
          No influencer videos found on this page.
        </p>
      )}
      {TIER_SECTIONS.map(({ tier, title, description }) => (
        <TierSection
          key={tier}
          title={title}
          description={description}
          videos={byTier(tier)}
        />
      ))}
      {unscored.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            Not scored ({unscored.length})
          </summary>
          <ul className="mt-2 text-sm text-zinc-500">
            {unscored.map((video) => (
              <li key={video.shortCode}>
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  @{video.creator}
                </a>{" "}
                —{" "}
                {video.tier === "too_recent"
                  ? "posted less than 3 days ago"
                  : "not enough videos to compare"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TierSection({
  title,
  description,
  videos,
}: {
  title: string;
  description: string;
  videos: AnalyzedVideo[];
}) {
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">
          {title} <span className="text-zinc-400">({videos.length})</span>
        </h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {videos.map((video) => (
          <VideoCard key={video.shortCode} video={video} />
        ))}
      </div>
    </section>
  );
}
