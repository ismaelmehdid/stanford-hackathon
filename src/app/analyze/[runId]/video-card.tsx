import Image from "next/image";
import { TierBadge } from "@/components/ui";
import type { AnalyzedVideo } from "@/lib/analysis/schema";
import {
  compactNumber,
  formatMultiple,
  humanize,
  scorePosition,
  splitTimestamp,
  topEmotions,
} from "./format";

const MAX_FRAMES = 8;
const INTENT_LEVELS = ["low", "medium", "high"] as const;

export function VideoCard({ video }: { video: AnalyzedVideo }) {
  const analysis = video.videoAnalysis;
  const comments = video.commentAnalysis;
  const step = Math.max(1, Math.ceil(video.frames.length / MAX_FRAMES));
  const frames = video.frames
    .filter((_, index) => index % step === 0)
    .slice(0, MAX_FRAMES);
  const beats = analysis?.description
    .split("\n")
    .filter((line) => line.trim())
    .map(splitTimestamp);

  return (
    <article
      id={`video-${video.id}`}
      className="flex min-w-0 scroll-mt-24 flex-col gap-6 overflow-hidden rounded-3xl border border-line bg-panel p-5 wrap-break-word transition-colors duration-700 target:border-foreground sm:p-7"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {video.rank !== null && (
            <span className="font-display text-5xl leading-none italic">
              {String(video.rank).padStart(2, "0")}
            </span>
          )}
          <div className="min-w-0">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-medium break-all hover:underline"
            >
              @{video.creator} <span className="text-muted">↗</span>
            </a>
            <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
              {video.source} · {video.postedAt.slice(0, 10)}
              {video.durationSeconds !== null &&
                ` · ${Math.round(video.durationSeconds)}s`}
            </p>
          </div>
        </div>
        <TierBadge tier={video.tier} />
      </header>

      {frames.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7">
          {frames.map((frame) => (
            <figure key={frame.file} className="shrink-0">
              <Image
                src={`/api/media/${video.shortCode}/${frame.file}`}
                alt={`Frame at ${frame.timestampSeconds}s`}
                width={90}
                height={160}
                unoptimized
                className="h-40 w-[90px] rounded-lg bg-panel-raised object-cover grayscale transition duration-500 hover:grayscale-0"
              />
              <figcaption className="mt-1 font-mono text-[10px] text-muted">
                {frame.timestampSeconds.toFixed(1)}s
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
        {(
          [
            ["Views", video.metrics.views],
            ["Likes", video.metrics.likes],
            ["Comments", video.metrics.comments],
          ] as const
        ).map(([name, value]) => (
          <div key={name} className="flex flex-col gap-1 px-3 py-3 first:pl-0">
            <dt className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
              {name}
            </dt>
            <dd className="font-mono text-xl tabular-nums">
              {value === null ? "hidden" : compactNumber.format(value)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <ScoreMeter label="vs brand page" score={video.brandScore} />
        <ScoreMeter label="vs creator page" score={video.influencerScore} />
      </div>

      {video.status === "failed" && (
        <p className="rounded-xl border border-line-strong px-4 py-3 text-sm">
          <span className="font-mono text-[11px] tracking-wider uppercase">
            Analysis failed
          </span>{" "}
          <span className="text-muted">{video.error}</span>
        </p>
      )}
      {video.status === "analyzed" && video.error && (
        <p className="text-sm text-muted">⚠ {video.error}</p>
      )}

      {analysis && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {[
              humanize(analysis.videoType),
              `${analysis.pacing.cutsCount} cuts`,
              humanize(analysis.audio.kind),
              analysis.hairstyle.styleAchieved,
            ].map((chip, index) => (
              <span
                key={`${index}-${chip}`}
                className={`rounded-full px-3 py-1 text-xs ${index === 0 ? "bg-foreground text-background" : "border border-line"}`}
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="border-l border-foreground pl-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
              Hook · first 3 seconds
            </p>
            <p className="mt-1.5">{analysis.hook.description}</p>
            <p className="mt-1.5 text-sm text-muted">
              {analysis.hook.whyItWorks}
            </p>
          </div>
          {beats && beats.length > 0 && (
            <details className="group/beats">
              <summary className="cursor-pointer list-none font-mono text-[11px] tracking-[0.2em] text-muted uppercase hover:text-foreground">
                <span className="inline-block transition group-open/beats:rotate-90">
                  →
                </span>{" "}
                Beat by beat ({beats.length})
              </summary>
              <ol className="mt-3 flex flex-col gap-2 text-sm">
                {beats.map((beat, index) => (
                  <li
                    key={`${index}-${beat.text}`}
                    className="grid grid-cols-[3.5rem_1fr] gap-3"
                  >
                    <span className="pt-0.5 font-mono text-[11px] text-muted">
                      {beat.time ?? "·"}
                    </span>
                    <span className="text-foreground/80">{beat.text}</span>
                  </li>
                ))}
              </ol>
              {video.transcript && (
                <p className="mt-4 font-display text-lg leading-snug text-foreground/70 italic">
                  “{video.transcript}”
                </p>
              )}
            </details>
          )}
        </div>
      )}

      {comments && (
        <div className="flex flex-col gap-4 rounded-2xl bg-panel-raised p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
              Comment emotions
            </p>
            <IntentMeter intent={comments.purchaseIntent} />
          </div>
          <ul className="flex flex-col gap-2">
            {topEmotions(comments.emotions, 4).map(({ emotion, share }) => (
              <li
                key={emotion}
                className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm"
              >
                <span
                  className={
                    emotion === comments.dominantEmotion
                      ? "text-foreground"
                      : "text-muted"
                  }
                >
                  {humanize(emotion)}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className="block h-full rounded-full bg-foreground"
                    style={{ width: `${share * 100}%` }}
                  />
                </span>
                <span className="text-right font-mono text-xs tabular-nums">
                  {Math.round(share * 100)}%
                </span>
              </li>
            ))}
          </ul>
          {comments.quotes.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {comments.quotes.map((quote, index) => (
                <p
                  // Quotes are AI-selected comments and may repeat.
                  key={`${index}-${quote}`}
                  className="font-display text-lg leading-snug italic"
                >
                  “{quote}”
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// Log scale centered at 1×: the bar grows right when the video beat the page, left when it did not.
function ScoreMeter({ label, score }: { label: string; score: number | null }) {
  const position = score === null ? 0 : scorePosition(score);
  return (
    <div className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="relative h-2 rounded-full bg-foreground/8">
        <span className="absolute inset-y-[-4px] left-1/2 w-px bg-foreground/40" />
        {score !== null && (
          <span
            className={`absolute inset-y-0 rounded-full ${position >= 0 ? "bg-foreground" : "bg-foreground/35"}`}
            style={{
              left: `${50 + Math.min(0, position) * 50}%`,
              width: `${Math.abs(position) * 50}%`,
            }}
          />
        )}
      </span>
      <span className="text-right font-mono tabular-nums">
        {formatMultiple(score)}
      </span>
    </div>
  );
}

function IntentMeter({ intent }: { intent: (typeof INTENT_LEVELS)[number] }) {
  const level = INTENT_LEVELS.indexOf(intent);
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
      Purchase intent
      <span className="flex items-end gap-0.5" aria-label={intent}>
        {INTENT_LEVELS.map((name, index) => (
          <span
            key={name}
            className={`w-1 rounded-sm ${index <= level ? "bg-foreground" : "bg-foreground/15"}`}
            style={{ height: `${6 + index * 4}px` }}
          />
        ))}
      </span>
      <span className="text-foreground">{intent}</span>
    </span>
  );
}
