"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  GenerationState,
  ScriptEntry,
  Take,
} from "@/lib/generation/schema";

const STAGE_LABELS: Record<GenerationState["stage"], string> = {
  scripts: "writing scripts",
  videos: "rendering takes",
  done: "done",
};

const TAKE_STATUS_LABELS: Record<Take["status"], string> = {
  pending: "Waiting to render",
  running: "Rendering…",
  completed: "Ready",
  failed: "Failed",
};

const isActive = (generation: GenerationState) =>
  generation.status === "queued" || generation.status === "running";

const videoUrl = (generationId: string, file: string) =>
  `/api/generations/${encodeURIComponent(generationId)}/videos/${encodeURIComponent(file)}`;

// Builds the picks file in the browser, so no extra API route is needed.
function downloadPicks(generation: GenerationState) {
  const picks = generation.scripts.flatMap(({ script, takes }) => {
    const takeIndex = generation.picks[script.id];
    const take = takes.find((item) => item.index === takeIndex);
    if (takeIndex === undefined || !take) return [];
    return [
      {
        scriptId: script.id,
        title: script.title,
        hairstyle: script.hairstyle,
        takeIndex,
        file: take.file,
        script,
      },
    ];
  });
  const blob = new Blob(
    [
      JSON.stringify(
        { generationId: generation.id, brand: generation.brand, picks },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${generation.id}-picks.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function GenerationView({ generationId }: { generationId: string }) {
  const [generation, setGeneration] = useState<GenerationState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await fetch(
          `/api/generations/${encodeURIComponent(generationId)}`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok || !body.generation) {
          setError(body.error ?? "Generation not found.");
          return;
        }
        setGeneration(body.generation);
        if (isActive(body.generation)) timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 6000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [generationId]);

  if (error) return <p className="text-red-600 dark:text-red-400">{error}</p>;
  if (!generation) return <p className="text-zinc-500">Loading generation…</p>;

  const takes = generation.scripts.flatMap((entry) => entry.takes);
  const finished = takes.filter(
    (take) => take.status === "completed" || take.status === "failed",
  ).length;
  const pickCount = Object.keys(generation.picks).length;
  const { settings } = generation;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/generate"
          className="self-start text-sm text-zinc-500 hover:underline"
        >
          ← All generations
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight break-all">
          @{generation.brand}
        </h1>
        <p className="text-sm text-zinc-500">
          {generation.status} · {STAGE_LABELS[generation.stage]}
          {generation.stage === "videos" &&
            takes.length > 0 &&
            ` (${finished}/${takes.length} takes)`}{" "}
          · ≈ ${generation.estimatedCostUsd.toFixed(2)} Sora · started{" "}
          {new Date(generation.createdAt).toLocaleString()}
        </p>
        <p className="text-sm text-zinc-500">
          {settings.hairstylesPerBrief} hairstyle
          {settings.hairstylesPerBrief === 1 ? "" : "s"} per brief ·{" "}
          {settings.takesPerScript} take
          {settings.takesPerScript === 1 ? "" : "s"} per script ·{" "}
          {settings.seconds} s each
        </p>
        {generation.error && (
          <p className="rounded-md bg-red-50 px-4 py-3 wrap-break-word text-red-700 dark:bg-red-950 dark:text-red-300">
            {generation.error}
          </p>
        )}
      </header>

      {generation.scripts.length === 0 ? (
        <p className="text-zinc-500">
          {isActive(generation)
            ? "Writing scripts…"
            : "No scripts were written."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={pickCount === 0}
              onClick={() => downloadPicks(generation)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Download picks JSON
            </button>
            <p className="text-sm text-zinc-500">
              {pickCount} of {generation.scripts.length} scripts picked
            </p>
          </div>
          <div className="flex flex-col gap-6">
            {generation.scripts.map((entry) => (
              <ScriptCard
                key={entry.script.id}
                generationId={generation.id}
                entry={entry}
                pickedIndex={generation.picks[entry.script.id]}
                onPicked={setGeneration}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ScriptCard({
  generationId,
  entry,
  pickedIndex,
  onPicked,
}: {
  generationId: string;
  entry: ScriptEntry;
  pickedIndex: number | undefined;
  onPicked: (generation: GenerationState) => void;
}) {
  const { script, takes } = entry;
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(takeIndex: number) {
    setPicking(takeIndex);
    setError(null);
    try {
      const response = await fetch(
        `/api/generations/${encodeURIComponent(generationId)}/pick`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId: script.id, takeIndex }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.generation)
        setError(body.error ?? "Could not save the pick.");
      else onPicked(body.generation);
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setPicking(null);
  }

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-zinc-200 p-4 wrap-break-word sm:p-6 dark:border-zinc-800">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{script.title}</h2>
        <p className="text-sm">
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
            {script.format.replace(/_/g, " ")}
          </span>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">
            {script.hairstyle}
          </span>
          {pickedIndex !== undefined && (
            <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Take {pickedIndex} picked
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-3xl sm:grid-cols-3">
        {takes.map((take) => (
          <TakeCell
            key={take.index}
            generationId={generationId}
            take={take}
            picked={pickedIndex === take.index}
            picking={picking !== null}
            onPick={() => pick(take.index)}
          />
        ))}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex flex-col gap-2 text-sm">
        {script.voiceover && (
          <p>
            <span className="font-medium">Voiceover:</span>{" "}
            <span className="text-zinc-600 italic dark:text-zinc-400">
              “{script.voiceover}”
            </span>
          </p>
        )}
        {script.onScreenText.length > 0 && (
          <div>
            <p className="font-medium">On-screen text</p>
            <ul className="mt-1 flex flex-col gap-1">
              {script.onScreenText.map((line, index) => (
                <li
                  // Text lines are AI-written and may repeat.
                  key={`${index}-${line}`}
                  className="border-l-2 border-zinc-300 pl-2 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
        {script.emotionalTriggers.length > 0 && (
          <p>
            <span className="font-medium">Emotional triggers:</span>{" "}
            <span className="text-zinc-600 dark:text-zinc-400">
              {script.emotionalTriggers.join(" · ")}
            </span>
          </p>
        )}
        <p>
          <span className="font-medium">Why:</span>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">
            {script.rationale}
          </span>
        </p>
        <details>
          <summary className="cursor-pointer font-medium">Sora prompt</summary>
          <p className="mt-1 whitespace-pre-line text-zinc-600 dark:text-zinc-400">
            {script.soraPrompt}
          </p>
        </details>
      </div>
    </article>
  );
}

function TakeCell({
  generationId,
  take,
  picked,
  picking,
  onPick,
}: {
  generationId: string;
  take: Take;
  picked: boolean;
  picking: boolean;
  onPick: () => void;
}) {
  const file = take.status === "completed" ? take.file : null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {file ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={videoUrl(generationId, file)}
          className={`aspect-9/16 max-h-[420px] w-full rounded-lg bg-black object-contain ${picked ? "ring-2 ring-emerald-500" : ""}`}
        />
      ) : (
        <div className="flex aspect-9/16 max-h-[420px] w-full flex-col items-center justify-center gap-2 overflow-auto rounded-lg bg-zinc-100 p-3 text-center text-xs wrap-break-word dark:bg-zinc-900">
          <span
            className={
              take.status === "failed"
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-zinc-500"
            }
          >
            {TAKE_STATUS_LABELS[take.status]}
          </span>
          {take.error && (
            <span className="text-red-600 dark:text-red-400">{take.error}</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-zinc-500">Take {take.index}</span>
        {picked ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Picked
          </span>
        ) : (
          file && (
            <button
              type="button"
              disabled={picking}
              onClick={onPick}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Pick this take
            </button>
          )
        )}
      </div>
    </div>
  );
}
