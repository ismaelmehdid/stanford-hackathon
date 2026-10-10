"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/ui";
import type { RunState } from "@/lib/analysis/schema";

const STATUS_DOT: Record<RunState["status"], string> = {
  queued: "border border-foreground animate-pulse-soft",
  running: "bg-foreground animate-pulse-soft",
  completed: "bg-foreground",
  failed: "border border-foreground/50",
};

export function RunList() {
  const [runs, setRuns] = useState<RunState[] | null>(null);

  useEffect(() => {
    fetch("/api/runs", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { runs?: RunState[] }) => setRuns(body.runs ?? []))
      .catch(() => setRuns([]));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        title="Reports"
        description="Every run is cached, so re-running a brand reuses finished scrapes and AI calls."
      />
      {runs === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-16 animate-pulse rounded-2xl bg-foreground/5"
            />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-muted">
          No reports yet. Start an analysis above.
        </p>
      ) : (
        <ul className="flex flex-col border-t border-line">
          {runs.map((run) => (
            <li key={run.id} className="border-b border-line">
              <Link
                href={`/analyze/${run.id}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 transition-colors sm:grid-cols-[1fr_9rem_12rem_2rem] sm:px-3 sm:hover:bg-foreground/[0.03]"
              >
                <span className="font-display text-3xl break-all transition-transform group-hover:translate-x-1">
                  @{run.brandUsername}
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase sm:justify-self-start">
                  <span
                    className={`size-1.5 rounded-full ${STATUS_DOT[run.status]}`}
                  />
                  {run.status}
                </span>
                <span className="col-span-2 font-mono text-xs text-muted sm:col-span-1">
                  {new Date(run.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="hidden text-muted transition group-hover:translate-x-1 group-hover:text-foreground sm:block">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
