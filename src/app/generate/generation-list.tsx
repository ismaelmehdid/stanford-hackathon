"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/ui";
import type { GenerationState } from "@/lib/generation/schema";

const STATUS_DOT: Record<GenerationState["status"], string> = {
  queued: "border border-foreground animate-pulse-soft",
  running: "bg-foreground animate-pulse-soft",
  completed: "bg-foreground",
  failed: "border border-foreground/50",
};

export function GenerationList() {
  const [generations, setGenerations] = useState<GenerationState[] | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/generations", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { generations?: GenerationState[] }) =>
        setGenerations(body.generations ?? []),
      )
      .catch(() => setGenerations([]));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        title="Generations"
        description="Open a generation to compare its takes and pick the best one for each script."
      />
      {generations === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-20 animate-pulse rounded-2xl bg-foreground/5"
            />
          ))}
        </div>
      ) : generations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-muted">
          No generations yet. Start one above.
        </p>
      ) : (
        <ul className="flex flex-col border-t border-line">
          {generations.map((generation) => (
            <li key={generation.id} className="border-b border-line">
              <Link
                href={`/generate/${generation.id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 py-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:px-3 sm:hover:bg-foreground/[0.03] lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,24rem)_9rem_1.5rem]"
              >
                <span className="min-w-0 font-display text-3xl break-all transition-transform group-hover:translate-x-1">
                  @{generation.brand}
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase lg:justify-self-start">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[generation.status]}`}
                  />
                  {generation.status}
                </span>
                <span className="col-span-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted tabular-nums lg:col-span-1">
                  <span>
                    <span className="text-foreground">
                      {generation.scripts.length}
                    </span>{" "}
                    scripts
                  </span>
                  <span>
                    <span className="text-foreground">
                      {Object.keys(generation.picks).length}
                    </span>{" "}
                    picked
                  </span>
                  <span>
                    ≈ ${generation.estimatedCostUsd.toFixed(2)} estimated
                  </span>
                  <span>
                    <span className="text-foreground">
                      ${(generation.actualCostUsd ?? 0).toFixed(2)}
                    </span>{" "}
                    spent
                  </span>
                </span>
                <time
                  dateTime={generation.createdAt}
                  className="col-span-2 font-mono text-xs text-muted lg:col-span-1"
                >
                  {new Date(generation.createdAt).toLocaleString()}
                </time>
                <span
                  aria-hidden
                  className="hidden text-muted transition group-hover:translate-x-1 group-hover:text-foreground lg:block"
                >
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
