"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { StrandsCanvas } from "@/components/three/strands-canvas";
import {
  buttonPrimary,
  buttonSecondary,
  Eyebrow,
  SectionHeader,
} from "@/components/ui";
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

const STATUS_LABELS: Record<GenerationState["status"], string> = {
  queued: "Queued",
  running: "Running",
  completed: "Complete",
  failed: "Failed",
};

const TAKE_STATUS_LABELS: Record<Take["status"], string> = {
  pending: "Waiting to render",
  running: "Rendering…",
  completed: "Ready",
  failed: "Failed",
};

// Take status without color: outlined while waiting, pulsing while rendering, solid when ready.
const TAKE_STATUS_DOT: Record<Exclude<Take["status"], "failed">, string> = {
  pending: "border border-foreground/50",
  running: "bg-foreground",
  completed: "bg-foreground",
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const buttonSmall = `inline-flex items-center justify-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-medium transition hover:border-foreground hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-strong disabled:hover:bg-transparent ${focusRing}`;

const labelClass =
  "font-mono text-[10px] tracking-[0.2em] text-muted uppercase";

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

  if (error)
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
        <Eyebrow>Storyboard previews</Eyebrow>
        <p className="font-display text-4xl wrap-break-word">
          <span aria-hidden className="mr-3 align-middle font-mono text-2xl">
            ✕
          </span>
          {error}
        </p>
        <Link href="/generate" className={`${buttonSecondary} ${focusRing}`}>
          ← All generations
        </Link>
      </div>
    );
  if (!generation) return <GenerationViewSkeleton />;

  const takes = generation.scripts.flatMap((entry) => entry.takes);
  const finished = takes.filter(
    (take) => take.status === "completed" || take.status === "failed",
  ).length;
  const pickCount = Object.keys(generation.picks).length;
  const { settings } = generation;
  const active = isActive(generation);
  const rendering = generation.stage === "videos" && takes.length > 0;
  const createdAt = new Date(generation.createdAt);

  return (
    <div className="flex flex-col">
      <header className="relative isolate overflow-hidden border-b border-line">
        <StrandsCanvas
          className="absolute inset-0 -z-10"
          density={0.7}
          intensity={active ? 1 : 0.7}
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/70 to-transparent" />
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-10 pb-12 sm:px-6 sm:pt-14 sm:pb-16">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/generate"
              className={`font-mono text-[11px] tracking-[0.25em] text-muted uppercase hover:text-foreground print:hidden ${focusRing}`}
            >
              ← All generations
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 font-mono text-[10px] tracking-[0.2em] uppercase">
              <span
                className={`size-1.5 rounded-full ${generation.status === "failed" ? "border border-foreground" : "bg-foreground"} ${active ? "animate-pulse-soft" : ""}`}
              />
              {STATUS_LABELS[generation.status]}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <Eyebrow>Storyboard previews</Eyebrow>
            <h1
              className="font-display leading-[0.95] tracking-tight break-all"
              // Fit the handle on one line where possible: about 0.45em per character.
              style={{
                fontSize: `clamp(2.25rem, calc((100vw - 2rem) / ${((generation.brand.length + 1) * 0.45).toFixed(2)}), 8rem)`,
              }}
            >
              @{generation.brand}
            </h1>
            <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
              <span>
                {settings.hairstylesPerBrief} hairstyle
                {settings.hairstylesPerBrief === 1 ? "" : "s"} per brief
              </span>
              <span aria-hidden>·</span>
              <span>
                {settings.takesPerScript} take
                {settings.takesPerScript === 1 ? "" : "s"} per script
              </span>
              <span aria-hidden>·</span>
              <span>{settings.seconds} s video each</span>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
            <Stat
              name="Stage"
              wide
              value={
                <span className="block first-letter:uppercase">
                  {STAGE_LABELS[generation.stage]}
                </span>
              }
              detail={
                rendering ? `${finished} / ${takes.length} takes` : undefined
              }
            >
              {active && rendering && (
                <span className="block h-px w-full bg-line">
                  <span
                    className="block h-px bg-foreground transition-[width] duration-1000"
                    style={{ width: `${(finished / takes.length) * 100}%` }}
                  />
                </span>
              )}
            </Stat>
            <Stat
              name="Scripts"
              value={
                generation.scripts.length
                  ? String(generation.scripts.length)
                  : "—"
              }
            />
            <Stat
              name="Picked"
              value={
                generation.scripts.length
                  ? `${pickCount} of ${generation.scripts.length}`
                  : "—"
              }
            />
            <Stat
              name="Estimated cost"
              value={`≈ ${formatUsd(generation.estimatedCostUsd)}`}
            />
            <Stat
              name="Spent on images"
              value={formatUsd(generation.actualCostUsd)}
            />
            <Stat
              name="Started"
              wide
              // Viewer's locale, with seconds, like the original toLocaleString().
              value={createdAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              detail={createdAt.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            />
          </dl>

          {generation.error && (
            <p className="max-w-3xl rounded-2xl border border-line-strong bg-background/60 px-5 py-4 text-sm wrap-break-word backdrop-blur">
              <span className="mr-2 font-mono text-[11px] tracking-[0.2em] uppercase">
                ✕ Error
              </span>
              <span className="text-muted">{generation.error}</span>
            </p>
          )}

          {generation.scripts.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                type="button"
                disabled={pickCount === 0}
                onClick={() => downloadPicks(generation)}
                className={`${buttonPrimary} ${focusRing} print:hidden`}
              >
                Download picks JSON ↓
              </button>
              <p className="font-mono text-xs text-muted tabular-nums">
                <span className="text-foreground">{pickCount}</span> of{" "}
                {generation.scripts.length} scripts picked
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
        {generation.scripts.length === 0 ? (
          active ? (
            <section className="flex flex-col gap-6">
              <h2 className="font-display text-4xl">
                Writing scripts<span className="animate-pulse-soft">…</span>
              </h2>
              <div aria-hidden className="flex flex-col gap-4">
                {[0, 1].map((index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 sm:p-7"
                  >
                    <span className="h-8 w-full max-w-sm animate-pulse rounded-full bg-foreground/10" />
                    <span className="h-3 w-48 animate-pulse rounded-full bg-foreground/10" />
                    <span className="h-3 w-full max-w-lg animate-pulse rounded-full bg-foreground/5" />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-muted">
              No scripts were written.
            </p>
          )
        ) : (
          <>
            <SectionHeader
              title="Scripts"
              description="Compare the takes of each script and pick the best one, then download your picks."
            />
            <div className="flex flex-col gap-6">
              {generation.scripts.map((entry, position) => (
                <ScriptCard
                  key={entry.script.id}
                  number={position + 1}
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
    </div>
  );
}

export function GenerationViewSkeleton() {
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-24 sm:px-6"
    >
      <span className="sr-only">Loading generation…</span>
      <span
        aria-hidden
        className="h-3 w-40 animate-pulse rounded-full bg-foreground/10"
      />
      <span
        aria-hidden
        className="h-20 w-full max-w-xl animate-pulse rounded-2xl bg-foreground/10"
      />
      <span
        aria-hidden
        className="h-4 w-72 max-w-full animate-pulse rounded-full bg-foreground/10"
      />
    </div>
  );
}

function Stat({
  name,
  value,
  detail,
  wide = false,
  children,
}: {
  name: string;
  value: ReactNode;
  detail?: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 border-t border-line-strong pt-3 ${wide ? "col-span-2" : ""}`}
    >
      <dt className={labelClass}>{name}</dt>
      <dd className="flex flex-col gap-3">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-xl whitespace-nowrap tabular-nums lg:text-2xl">
            {value}
          </span>
          {detail && (
            <span className="font-mono text-xs text-muted tabular-nums">
              {detail}
            </span>
          )}
        </span>
        {children}
      </dd>
    </div>
  );
}

function ScriptCard({
  number,
  generationId,
  entry,
  pickedIndex,
  onPicked,
}: {
  number: number;
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
    <article className="flex min-w-0 flex-col gap-8 overflow-hidden rounded-3xl border border-line bg-panel p-5 wrap-break-word sm:p-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden
            className="font-display text-5xl leading-none text-muted italic"
          >
            {String(number).padStart(2, "0")}
          </span>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="font-display text-3xl leading-tight">
              {script.title}
            </h3>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="rounded-full bg-foreground px-3 py-1 text-xs text-background">
                {script.format.replace(/_/g, " ")}
              </span>
              <span className="min-w-0 text-muted">{script.hairstyle}</span>
            </p>
          </div>
        </div>
        {pickedIndex !== undefined && (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-foreground px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-background uppercase">
            <span aria-hidden>✓</span> Take {pickedIndex} picked
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-4">
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
          {error && (
            <p className="flex gap-2 rounded-xl border border-line-strong px-4 py-3 text-sm">
              <span aria-hidden className="font-mono">
                ✕
              </span>
              <span className="min-w-0 text-foreground/80">{error}</span>
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6 text-sm lg:border-l lg:border-line lg:pl-10">
          {script.voiceover && (
            <div className="flex flex-col gap-2">
              <p className={labelClass}>Voiceover</p>
              <blockquote className="font-display text-2xl leading-snug italic">
                “{script.voiceover}”
              </blockquote>
            </div>
          )}
          {script.onScreenText.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className={labelClass}>On-screen text</p>
              <ul className="flex flex-col gap-1.5">
                {script.onScreenText.map((line, index) => (
                  <li
                    // Text lines are AI-written and may repeat.
                    key={`${index}-${line}`}
                    className="border-l border-line pl-3 text-foreground/80"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {script.emotionalTriggers.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className={labelClass}>Emotional triggers</p>
              <ul className="flex flex-wrap gap-1.5">
                {script.emotionalTriggers.map((trigger, index) => (
                  <li
                    // Triggers are AI-written and may repeat.
                    key={`${index}-${trigger}`}
                    className="rounded-full border border-line px-3 py-1 text-xs"
                  >
                    {trigger}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-l border-foreground pl-4">
            <p className={labelClass}>Why</p>
            <p className="mt-1.5 text-foreground/80">{script.rationale}</p>
          </div>
          {script.videoPrompt && (
            <details className="group/prompt">
              <summary className="cursor-pointer list-none font-mono text-[11px] tracking-[0.2em] text-muted uppercase hover:text-foreground">
                <span
                  aria-hidden
                  className="inline-block transition group-open/prompt:rotate-90"
                >
                  →
                </span>{" "}
                Video prompt
              </summary>
              <p className="mt-3 whitespace-pre-line text-foreground/80">
                {script.videoPrompt}
              </p>
            </details>
          )}
        </div>
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
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-3 transition-colors sm:p-4 ${picked ? "border-foreground bg-foreground/5" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h4 className="font-display text-2xl leading-none">
            Take {take.index}
          </h4>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase ${take.status === "pending" ? "text-muted" : ""} ${take.status === "running" ? "animate-pulse-soft" : ""}`}
          >
            {take.status === "failed" ? (
              <span aria-hidden>✕</span>
            ) : (
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${TAKE_STATUS_DOT[take.status]}`}
              />
            )}
            {TAKE_STATUS_LABELS[take.status]}
          </span>
          {take.costUsd !== null && (
            <span className="font-mono text-xs text-muted tabular-nums">
              {formatUsd(take.costUsd)}
            </span>
          )}
        </span>
        {picked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-background uppercase">
            <span aria-hidden>✓</span> Picked
          </span>
        ) : (
          finished && (
            <button
              type="button"
              disabled={picking}
              onClick={onPick}
              className={`${buttonSmall} print:hidden`}
            >
              Pick this take
              {/* Keeps the visible text first in the name, so each button is distinct. */}
              <span className="sr-only"> (take {take.index})</span>
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
        <p className="flex gap-2 text-xs wrap-break-word">
          <span aria-hidden className="font-mono">
            ✕
          </span>
          <span className="min-w-0 text-foreground/80">{take.error}</span>
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
    <li className="flex min-w-0 flex-col gap-1.5">
      {frame.file ? (
        <a
          href={imageUrl(generationId, frame.file)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${caption} full size`}
          className={`group/frame block overflow-hidden rounded-xl bg-panel-raised ${focusRing}`}
        >
          {/* Frames are already sized JPEGs served by our own route, so the image optimizer adds nothing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(generationId, frame.file)}
            alt={caption}
            loading="lazy"
            decoding="async"
            // Full color: frames are compared to pick a take, and hair and product color matter.
            className="aspect-9/16 w-full object-cover transition duration-500 group-hover/frame:scale-[1.03] group-focus-visible/frame:scale-[1.03]"
          />
        </a>
      ) : (
        <div
          className={`flex aspect-9/16 w-full items-center justify-center rounded-xl bg-panel-raised p-1 text-center font-mono text-[10px] tracking-[0.15em] text-muted uppercase ${status === "running" ? "animate-pulse-soft" : status === "pending" ? "" : "border border-dashed border-line-strong"}`}
        >
          {status === "running"
            ? "Rendering…"
            : status === "pending"
              ? "Waiting"
              : "Not rendered"}
        </div>
      )}
      <span className="truncate font-mono text-[10px] tracking-wider text-muted uppercase">
        {caption}
      </span>
    </li>
  );
}
