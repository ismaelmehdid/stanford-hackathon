"use client";

import { useEffect, useRef, useState } from "react";
import { TierMark } from "@/components/ui";
import type { SpacePoint } from "@/components/three/performance-space";
import { isAnalyzedTier, type AnalyzedVideo } from "@/lib/analysis/schema";

type Status = "loading" | "ready" | "unavailable";

/** Interactive 3D chart of every scored video. Clicking a pillar jumps to its card. */
export function PerformanceChart({ videos }: { videos: AnalyzedVideo[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const points: SpacePoint[] = videos.flatMap((video) =>
    isAnalyzedTier(video.tier) &&
    video.brandScore !== null &&
    video.influencerScore !== null
      ? [
          {
            id: video.id,
            creator: video.creator,
            tier: video.tier,
            rank: video.rank,
            brandScore: video.brandScore,
            influencerScore: video.influencerScore,
            views: video.metrics.views,
          },
        ]
      : [],
  );
  // Rebuild the scene only when the plotted data changes, not on every poll.
  const key = JSON.stringify(points);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const data = JSON.parse(key) as SpacePoint[];
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import("@/components/three/performance-space")
      .then(({ mountPerformanceSpace }) => {
        if (cancelled) return;
        dispose = mountPerformanceSpace(container, {
          points: data,
          onSelect: (point) => {
            window.location.hash = `video-${point.id}`;
          },
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [key]);

  if (points.length === 0) return null;
  return (
    <figure className="relative overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_at_50%_35%,rgb(255_255_255/0.07),transparent_65%)] print:hidden">
      <figcaption className="pointer-events-none z-10 flex flex-wrap items-start justify-between gap-4 p-5 sm:absolute sm:inset-x-0 sm:top-0 sm:p-6">
        <div>
          <p className="font-mono text-[11px] tracking-[0.25em] text-muted uppercase">
            Performance space
          </p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Each pillar is a video. Its height is views. The bright lines mark
            1×, the page&apos;s usual video.
          </p>
          <p className="mt-3 font-mono text-[10px] tracking-[0.2em] text-subtle uppercase">
            Drag to rotate · click a pillar
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 font-mono text-[11px] tracking-wider uppercase">
          {(["amplify", "observe", "stop"] as const).map((tier) => (
            <li key={tier} className="flex items-center gap-2">
              <TierMark tier={tier} className="size-3" />
              {tier}
            </li>
          ))}
        </ul>
      </figcaption>
      <div
        ref={ref}
        role="img"
        aria-label={`3D chart of ${points.length} videos by score against the brand page, score against the creator page, and views.`}
        className={`relative h-[360px] transition-opacity duration-1000 sm:h-[560px] ${status === "ready" ? "opacity-100" : "opacity-0"}`}
      />
      {status !== "ready" && (
        <p className="absolute inset-0 grid place-items-center font-mono text-xs tracking-[0.2em] text-muted uppercase">
          {status === "loading" ? "Building 3D view…" : "3D view unavailable"}
        </p>
      )}
    </figure>
  );
}
