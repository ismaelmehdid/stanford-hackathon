"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GenerationState } from "@/lib/generation/schema";

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

  if (!generations?.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Past generations</h2>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {generations.map((generation) => (
          <li key={generation.id}>
            <Link
              href={`/generate/${generation.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="font-medium break-all">@{generation.brand}</span>
              <span className="text-sm text-zinc-500">
                {generation.status} · {generation.scripts.length} scripts ·{" "}
                {Object.keys(generation.picks).length} picked · ≈ $
                {generation.estimatedCostUsd.toFixed(2)} estimated · $
                {(generation.actualCostUsd ?? 0).toFixed(2)} spent ·{" "}
                {new Date(generation.createdAt).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
