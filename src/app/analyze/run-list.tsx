"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunState } from "@/lib/analysis/schema";

export function RunList() {
  const [runs, setRuns] = useState<RunState[] | null>(null);

  useEffect(() => {
    fetch("/api/runs", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { runs?: RunState[] }) => setRuns(body.runs ?? []))
      .catch(() => setRuns([]));
  }, []);

  if (!runs?.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Past runs</h2>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {runs.map((run) => (
          <li key={run.id}>
            <Link
              href={`/analyze/${run.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="font-medium break-all">
                @{run.brandUsername}
              </span>
              <span className="text-sm text-zinc-500">
                {run.status} · {new Date(run.createdAt).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
