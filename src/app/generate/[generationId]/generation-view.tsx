"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  GenerationState,
  ScriptEntry,
  StoryboardLabel,
  Take,
  TakeFrame,
} from "@/lib/generation/schema";

const STAGE_LABELS: Record<GenerationState["stage"], string> = {
  scripts: "writing scripts",
  videos: "rendering previews",
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

const FRAME_LABELS: Record<StoryboardLabel, string> = {
  hook: "Hook",
  product: "Product",
  reveal: "Reveal",
};

const imageUrl = (generationId: string, file: string) =>
  `/api/generations/${encodeURIComponent(generationId)}/images/${encodeURIComponent(file)}`;

// Generations saved before storyboard previews have no frames.
const takeFrames = (take: Take): TakeFrame[] => take.frames ?? [];

const formatUsd = (value: number | null | undefined) =>
  `$${(value ?? 0).toFixed(2)}`;

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
        frames: takeFrames(take).map(({ label, atSecond, file }) => ({
          label,
          atSecond,
          file,
        })),
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
          · started {new Date(generation.createdAt).toLocaleString()}
        </p>
        <p className="text-sm text-zinc-500">
          ≈ {formatUsd(generation.estimatedCostUsd)} estimated ·{" "}
          {formatUsd(generation.actualCostUsd)} spent on images
        </p>
        <p className="text-sm text-zinc-500">
          {settings.hairstylesPerBrief} hairstyle
          {settings.hairstylesPerBrief === 1 ? "" : "s"} per brief ·{" "}
          {settings.takesPerScript} take
          {settings.takesPerScript === 1 ? "" : "s"} per script ·{" "}
          {settings.seconds} s video each
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

      <div className="flex min-w-0 flex-col gap-5 sm:max-w-2xl">
        {takes.map((take) => (
          <TakeRow
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
        {script.videoPrompt && (
          <details>
            <summary className="cursor-pointer font-medium">
              Video prompt
            </summary>
            <p className="mt-1 whitespace-pre-line text-zinc-600 dark:text-zinc-400">
              {script.videoPrompt}
            </p>
          </details>
        )}
      </div>
    </article>
  );
}

function TakeRow({
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
  const frames = takeFrames(take);
  const finished =
    take.status === "completed" &&
    frames.length > 0 &&
    frames.every((frame) => frame.file);
  return (
    <section
      className={`flex min-w-0 flex-col gap-2 rounded-lg p-2 ${picked ? "bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950/40" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">Take {take.index}</span>
          <span
            className={
              take.status === "failed"
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-zinc-500"
            }
          >
            {TAKE_STATUS_LABELS[take.status]}
          </span>
          {take.costUsd !== null && (
            <span className="text-zinc-500">{formatUsd(take.costUsd)}</span>
          )}
        </span>
        {picked ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Picked
          </span>
        ) : (
          finished && (
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
      {frames.length > 0 && (
        <ol className="grid grid-cols-3 gap-2">
          {frames.map((frame, position) => (
            <FrameCell
              key={`${position}-${frame.label}`}
              generationId={generationId}
              frame={frame}
              status={take.status}
            />
          ))}
        </ol>
      )}
      {take.error && (
        <p className="text-xs wrap-break-word text-red-600 dark:text-red-400">
          {take.error}
        </p>
      )}
    </section>
  );
}

function FrameCell({
  generationId,
  frame,
  status,
}: {
  generationId: string;
  frame: TakeFrame;
  status: Take["status"];
}) {
  const caption = `${FRAME_LABELS[frame.label] ?? frame.label} · ${frame.atSecond} s`;
  return (
    <li className="flex min-w-0 flex-col gap-1">
      {frame.file ? (
        <a
          href={imageUrl(generationId, frame.file)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${caption} full size`}
          className="block overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900"
        >
          {/* Frames are already sized JPEGs served by our own route, so the image optimizer adds nothing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(generationId, frame.file)}
            alt={caption}
            loading="lazy"
            decoding="async"
            className="aspect-9/16 w-full object-cover"
          />
        </a>
      ) : (
        <div className="flex aspect-9/16 w-full items-center justify-center rounded-md bg-zinc-100 p-1 text-center text-xs text-zinc-500 dark:bg-zinc-900">
          {status === "running"
            ? "Rendering…"
            : status === "pending"
              ? "Waiting"
              : "Not rendered"}
        </div>
      )}
      <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
        {caption}
      </span>
    </li>
  );
}
