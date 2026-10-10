"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StrandsCanvas } from "@/components/three/strands-canvas";
import {
  buttonPrimary,
  buttonSecondary,
  Eyebrow,
  SectionHeader,
  TIER_COPY,
  TierMark,
} from "@/components/ui";
import {
  ANALYZED_TIERS,
  STAGE_LABELS,
  STAGES,
  type AnalyzedVideo,
  type BrandAnalysis,
  type RunState,
} from "@/lib/analysis/schema";
import {
  BriefsSection,
  FindingsSection,
  TriggersSection,
} from "./conclusions-panel";
import { compactNumber, formatMultiple } from "./format";
import { PerformanceChart } from "./performance-chart";
import { VideoCard } from "./video-card";

type RunResponse = { run: RunState; analysis: BrandAnalysis | null };

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

  if (error)
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
        <Eyebrow>Report</Eyebrow>
        <p className="font-display text-4xl">{error}</p>
        <Link href="/analyze" className={buttonSecondary}>
          ← All reports
        </Link>
      </div>
    );
  if (!data) return <RunViewSkeleton />;
  const { run, analysis } = data;

  return (
    <div className="flex flex-col">
      <ReportHeader run={run} analysis={analysis} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-12 sm:px-6 sm:py-16">
        <PipelineProgress run={run} />
        {analysis && <Report analysis={analysis} />}
      </div>
    </div>
  );
}

export function RunViewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-24 sm:px-6">
      <span className="h-3 w-40 animate-pulse rounded-full bg-foreground/10" />
      <span className="h-20 w-full max-w-xl animate-pulse rounded-2xl bg-foreground/10" />
      <span className="h-4 w-72 animate-pulse rounded-full bg-foreground/10" />
    </div>
  );
}

const STATUS_LABEL: Record<RunState["status"], string> = {
  queued: "Queued",
  running: "Running",
  completed: "Complete",
  failed: "Failed",
};

function ReportHeader({
  run,
  analysis,
}: {
  run: RunState;
  analysis: BrandAnalysis | null;
}) {
  const active = run.status === "queued" || run.status === "running";
  const videos = analysis?.videos ?? run.videos;
  const creators = new Set(videos.map((video) => video.creator)).size;
  const stats: [string, string][] = [
    [
      "Followers",
      analysis?.brand.followers != null
        ? compactNumber.format(analysis.brand.followers)
        : "—",
    ],
    ["Influencer videos", videos.length ? String(videos.length) : "—"],
    ["Creators", creators ? String(creators) : "—"],
    ["Apify spend", `$${run.apifySpendUsd.toFixed(2)}`],
    [
      "Started",
      new Date(run.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    ],
  ];

  return (
    <header className="relative isolate overflow-hidden border-b border-line">
      <StrandsCanvas
        className="absolute inset-0 -z-10"
        density={0.7}
        intensity={active ? 1 : 0.7}
      />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/70 to-transparent" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-10 pb-12 sm:px-6 sm:pt-14 sm:pb-16">
        <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
          <Link
            href="/analyze"
            className="font-mono text-[11px] tracking-[0.25em] text-muted uppercase hover:text-foreground"
          >
            ← All reports
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 font-mono text-[10px] tracking-[0.2em] uppercase">
            <span
              className={`size-1.5 rounded-full ${run.status === "failed" ? "border border-foreground" : "bg-foreground"} ${active ? "animate-pulse-soft" : ""}`}
            />
            {STATUS_LABEL[run.status]}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <Eyebrow>Influencer video report</Eyebrow>
          <h1
            className="font-display leading-[0.95] tracking-tight break-all"
            // Fit the handle on one line where possible: about 0.45em per character.
            style={{
              fontSize: `clamp(2.25rem, calc((100vw - 2rem) / ${((run.brandUsername.length + 1) * 0.45).toFixed(2)}), 8rem)`,
            }}
          >
            @{run.brandUsername}
          </h1>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map(([name, value]) => (
            <div
              key={name}
              className="flex flex-col gap-1.5 border-t border-line-strong pt-3"
            >
              <dt className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
                {name}
              </dt>
              <dd className="font-mono text-xl whitespace-nowrap tabular-nums sm:text-2xl">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {run.error && (
          <p className="max-w-3xl rounded-2xl border border-line-strong bg-background/60 px-5 py-4 text-sm backdrop-blur">
            <span className="mr-2 font-mono text-[11px] tracking-[0.2em] uppercase">
              ✕ Error
            </span>
            <span className="text-muted">{run.error}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-3 print:hidden">
          {analysis && (
            <a href={`/api/runs/${run.id}/analysis`} className={buttonPrimary}>
              Download JSON for video generation ↓
            </a>
          )}
          {analysis && (
            <button
              type="button"
              onClick={() => window.print()}
              className={buttonSecondary}
            >
              Print or save as PDF
            </button>
          )}
          <a
            href={run.brandUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonSecondary}
          >
            Instagram ↗
          </a>
        </div>
      </div>
    </header>
  );
}

function StageIcon({
  status,
}: {
  status: RunState["stages"]["score"]["status"];
}) {
  if (status === "done")
    return (
      <span className="grid size-5 place-items-center rounded-full bg-foreground text-[10px] text-background">
        ✓
      </span>
    );
  if (status === "failed")
    return (
      <span className="grid size-5 place-items-center rounded-full border border-foreground text-[10px]">
        ✕
      </span>
    );
  if (status === "running")
    return (
      <span className="grid size-5 place-items-center rounded-full border border-foreground">
        <span className="size-2 animate-pulse-soft rounded-full bg-foreground" />
      </span>
    );
  return <span className="size-5 rounded-full border border-line-strong" />;
}

function PipelineProgress({ run }: { run: RunState }) {
  const done = STAGES.filter(
    (name) => run.stages[name].status === "done",
  ).length;
  const tracked = run.videos.filter((video) => video.status !== "skipped");
  const analyzed = tracked.filter(
    (video) => video.status === "analyzed" || video.status === "failed",
  ).length;
  const active = run.status === "queued" || run.status === "running";

  const steps = (
    <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {STAGES.map((name, index) => {
        const stage = run.stages[name];
        return (
          <li
            key={name}
            className={`flex flex-col gap-3 bg-background p-4 ${stage.status === "pending" ? "text-muted" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <StageIcon status={stage.status} />
            </div>
            <p className="text-sm font-medium">
              {STAGE_LABELS[name]}
              {name === "analyzeVideos" &&
                tracked.length > 0 &&
                stage.status === "running" &&
                ` (${analyzed}/${tracked.length})`}
            </p>
            {stage.detail && (
              <p className="text-xs leading-relaxed text-muted">
                {stage.detail}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );

  if (run.status === "completed")
    return (
      <details className="group/pipeline print:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 font-mono text-[11px] tracking-[0.2em] text-muted uppercase hover:text-foreground">
          <span className="transition group-open/pipeline:rotate-90">→</span>
          Pipeline · {done} of {STAGES.length} steps complete
        </summary>
        <div className="mt-4">{steps}</div>
      </details>
    );

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-4xl">
          {active ? "Analyzing" : "Pipeline"}
          {active && <span className="animate-pulse-soft">…</span>}
        </h2>
        <p className="font-mono text-xs text-muted">
          {done} / {STAGES.length} steps
        </p>
      </div>
      <div className="h-px w-full bg-line">
        <div
          className="h-px bg-foreground transition-[width] duration-1000"
          style={{ width: `${(done / STAGES.length) * 100}%` }}
        />
      </div>
      {steps}
      {tracked.length > 0 && (
        <div className="flex flex-col gap-3">
          <Eyebrow>Videos</Eyebrow>
          <ul className="flex flex-wrap gap-1.5">
            {tracked.map((video) => (
              <li
                key={video.shortCode}
                title={`@${video.creator} · ${video.status}`}
                className={`grid size-7 place-items-center rounded-md text-[10px] ${
                  video.status === "analyzed"
                    ? "bg-foreground text-background"
                    : video.status === "failed"
                      ? "border border-foreground"
                      : video.status === "running"
                        ? "animate-pulse-soft border border-foreground"
                        : "border border-line"
                }`}
              >
                {video.status === "failed" ? "✕" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const SECTIONS = [
  ["overview", "Overview"],
  ["findings", "Findings"],
  ["triggers", "Emotional triggers"],
  ["briefs", "Briefs"],
  ["videos", "Videos"],
] as const;

function ReportNav({ available }: { available: Set<string> }) {
  const [active, setActive] = useState<string>("overview");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const [id] of SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="sticky top-24 hidden self-start xl:block print:hidden">
      <Eyebrow>Contents</Eyebrow>
      <ol className="mt-4 flex flex-col gap-1 border-l border-line">
        {SECTIONS.filter(([id]) => available.has(id)).map(
          ([id, title], index) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`-ml-px flex gap-3 border-l py-1.5 pl-4 text-sm transition-colors ${active === id ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
              >
                <span className="font-mono text-[11px] leading-5">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {title}
              </a>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

function Report({ analysis }: { analysis: BrandAnalysis }) {
  const videoLookup = new Map(
    analysis.videos.map((video) => [video.id, video]),
  );
  const { conclusions } = analysis;
  const available = new Set<string>(["overview", "videos"]);
  if (conclusions) {
    available.add("findings").add("triggers");
    if (conclusions.replicationBriefs.length > 0) available.add("briefs");
  }

  return (
    <div className="grid grid-cols-1 gap-16 xl:grid-cols-[180px_1fr]">
      <ReportNav available={available} />
      <div className="flex min-w-0 flex-col gap-24">
        <Overview videos={analysis.videos} />
        {conclusions && (
          <>
            <FindingsSection conclusions={conclusions} videos={videoLookup} />
            <TriggersSection triggers={conclusions.emotionalTriggers} />
            <BriefsSection
              briefs={conclusions.replicationBriefs}
              videos={videoLookup}
            />
          </>
        )}
        <VideosSection
          videos={analysis.videos}
          index={conclusions ? (available.has("briefs") ? "05" : "04") : "02"}
        />
      </div>
    </div>
  );
}

function Overview({ videos }: { videos: AnalyzedVideo[] }) {
  const counts = Object.fromEntries(
    ANALYZED_TIERS.map((tier) => [
      tier,
      videos.filter((video) => video.tier === tier).length,
    ]),
  ) as Record<(typeof ANALYZED_TIERS)[number], number>;
  const scored = counts.amplify + counts.observe + counts.stop;
  const top =
    videos.find((video) => video.tier === "amplify" && video.rank === 1) ??
    videos.find((video) => video.tier === "observe" && video.rank === 1);
  const mostViewed = [...videos].sort(
    (a, b) => b.metrics.views - a.metrics.views,
  )[0];

  return (
    <section id="overview" className="flex scroll-mt-20 flex-col gap-10">
      <SectionHeader
        index="01"
        title="Overview"
        description="Every influencer video is compared with the median video on the brand's page and on the creator's own page."
      />
      {videos.length === 0 ? (
        <p className="text-muted">No influencer videos found on this page.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ANALYZED_TIERS.map((tier) => (
              <a
                key={tier}
                href={`#tier-${tier}`}
                className={`group flex flex-col justify-between gap-10 rounded-3xl p-6 transition sm:p-7 ${tier === "amplify" ? "bg-foreground text-background" : "border border-line-strong hover:border-foreground"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.2em] uppercase">
                    <TierMark
                      tier={tier}
                      inverted={tier === "amplify"}
                      className="size-3"
                    />
                    {TIER_COPY[tier].title}
                  </span>
                  <span className="opacity-50 transition group-hover:translate-x-1 group-hover:opacity-100">
                    →
                  </span>
                </div>
                <div>
                  <p className="font-display text-8xl leading-none tabular-nums">
                    {counts[tier]}
                  </p>
                  <p className="mt-3 text-sm opacity-60">
                    {TIER_COPY[tier].description}
                  </p>
                </div>
              </a>
            ))}
          </div>

          {scored > 0 && (
            <div
              className="flex h-3 w-full gap-1"
              role="img"
              aria-label={`${counts.amplify} amplify, ${counts.observe} observe, ${counts.stop} stop`}
            >
              {ANALYZED_TIERS.filter((tier) => counts[tier] > 0).map((tier) => (
                <span
                  key={tier}
                  style={{ flexGrow: counts[tier] }}
                  className={`rounded-full ${tier === "amplify" ? "bg-foreground" : tier === "observe" ? "hatch border border-foreground/60" : "border border-foreground/40"}`}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {top && (
              <Highlight
                label={`Top performer · ${top.tier}`}
                video={top}
                value={`${formatMultiple(top.brandScore)} brand · ${formatMultiple(top.influencerScore)} creator`}
              />
            )}
            {mostViewed && (
              <Highlight
                label="Most viewed"
                video={mostViewed}
                value={`${compactNumber.format(mostViewed.metrics.views)} views`}
              />
            )}
          </div>

          <PerformanceChart videos={videos} />
        </>
      )}
    </section>
  );
}

function Highlight({
  label,
  video,
  value,
}: {
  label: string;
  video: AnalyzedVideo;
  value: string;
}) {
  return (
    <a
      href={`#video-${video.id}`}
      className="group flex flex-col gap-2 bg-background p-5 transition-colors hover:bg-panel-raised sm:p-6"
    >
      <Eyebrow>{label}</Eyebrow>
      <p className="text-2xl font-medium break-all">
        @{video.creator}{" "}
        <span className="text-muted transition group-hover:text-foreground">
          →
        </span>
      </p>
      <p className="font-mono text-sm text-muted">{value}</p>
    </a>
  );
}

function VideosSection({
  videos,
  index,
}: {
  videos: AnalyzedVideo[];
  index: string;
}) {
  const unscored = videos.filter(
    (video) =>
      video.tier === "insufficient_data" || video.tier === "too_recent",
  );
  return (
    <section id="videos" className="flex scroll-mt-20 flex-col gap-14">
      <SectionHeader
        index={index}
        title="Videos"
        description="Ranked within each tier by their weaker score, so a video that wins on both pages ranks above one that wins big on one."
      />
      {ANALYZED_TIERS.map((tier) => {
        const tierVideos = videos.filter((video) => video.tier === tier);
        if (tierVideos.length === 0) return null;
        return (
          <div
            key={tier}
            id={`tier-${tier}`}
            className="flex scroll-mt-20 flex-col gap-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <h3 className="flex items-center gap-3 text-2xl font-medium">
                <TierMark tier={tier} className="size-3.5" />
                {TIER_COPY[tier].title}
                <span className="font-mono text-sm text-muted">
                  {tierVideos.length}
                </span>
              </h3>
              <p className="text-sm text-muted">
                {TIER_COPY[tier].description}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {tierVideos.map((video) => (
                <VideoCard key={video.shortCode} video={video} />
              ))}
            </div>
          </div>
        );
      })}
      {unscored.length > 0 && (
        <details className="group/unscored rounded-2xl border border-line p-5">
          <summary className="cursor-pointer list-none font-mono text-[11px] tracking-[0.2em] text-muted uppercase hover:text-foreground">
            <span className="inline-block transition group-open/unscored:rotate-90">
              →
            </span>{" "}
            Not scored ({unscored.length})
          </summary>
          <ul className="mt-4 flex flex-col divide-y divide-line text-sm">
            {unscored.map((video) => (
              <li
                key={video.shortCode}
                className="flex flex-wrap justify-between gap-2 py-2.5"
              >
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  @{video.creator} ↗
                </a>
                <span className="text-muted">
                  {video.tier === "too_recent"
                    ? "Posted less than 3 days ago"
                    : "Not enough videos to compare"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
