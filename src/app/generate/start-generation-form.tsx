"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { buttonPrimary } from "@/components/ui";
import {
  clampGenerationSettings,
  DEFAULT_GENERATION_SETTINGS,
  estimatePreviewCostUsd,
  FRAMES_PER_TAKE,
  GENERATION_LIMITS,
  IMAGE_QUALITIES,
  totalImages,
  VIDEO_SECONDS,
  type GenerationSettings,
  type ImageQuality,
} from "@/lib/generation/config";
import type { GenerationSource } from "@/lib/generation/sources";

type Brief = GenerationSource["briefs"][number];

const COUNT_FIELDS: {
  key: "hairstylesPerBrief" | "takesPerScript";
  label: string;
}[] = [
  { key: "hairstylesPerBrief", label: "Hairstyles per brief" },
  { key: "takesPerScript", label: "Takes per script" },
];

const labelClass =
  "font-mono text-[10px] tracking-[0.2em] text-muted uppercase";

const underlineClass =
  "w-full min-w-0 border-b border-line-strong py-2 outline-none focus:border-foreground";

// Native options inherit the select's background, so selects stay solid.
const selectClass = `${underlineClass} cursor-pointer appearance-none bg-background pr-7`;

const hintClass = "font-mono text-[10px] text-muted";

// Mirrors planScriptSlots: distinct, trimmed, non-empty hairstyles in brief order.
const distinctHairstyles = (brief: Brief) => [
  ...new Set(
    brief.hairstyleVariations
      .map((hairstyle) => hairstyle.trim())
      .filter(Boolean),
  ),
];

// The newest completed run, else the first source (the sample).
function defaultSource(sources: GenerationSource[]) {
  const runs = sources
    .filter((source) => source.id.startsWith("run:") && source.createdAt)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return runs[0] ?? sources[0] ?? null;
}

const allBriefIndexes = (source: GenerationSource | null) =>
  source ? source.briefs.map((brief) => brief.index) : [];

const isImageQuality = (value: unknown): value is ImageQuality =>
  (IMAGE_QUALITIES as readonly unknown[]).includes(value);

export function StartGenerationForm() {
  const router = useRouter();
  const [sources, setSources] = useState<GenerationSource[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [briefIndexes, setBriefIndexes] = useState<number[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>(
    DEFAULT_GENERATION_SETTINGS,
  );
  // The server's PREVIEW_IMAGE_QUALITY; the browser cannot read that variable.
  const [quality, setQuality] = useState<ImageQuality>("medium");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/generation-sources", { cache: "no-store" })
      .then((response) => response.json())
      .then(
        (body: { sources?: GenerationSource[]; imageQuality?: unknown }) => {
          const list = body.sources ?? [];
          const initial = defaultSource(list);
          if (isImageQuality(body.imageQuality)) setQuality(body.imageQuality);
          setSources(list);
          setSourceId(initial?.id ?? "");
          setBriefIndexes(allBriefIndexes(initial));
        },
      )
      .catch(() => {
        setSources([]);
        setError("Could not load analyses. Reload the page.");
      });
  }, []);

  const source = sources?.find((item) => item.id === sourceId) ?? null;
  // What the server will use: invalid inputs fall back to the defaults, and caps apply.
  const effective = clampGenerationSettings(settings);
  const scriptCount = (source?.briefs ?? [])
    .filter((brief) => briefIndexes.includes(brief.index))
    .reduce(
      (count, brief) =>
        count +
        Math.min(
          effective.hairstylesPerBrief,
          distinctHairstyles(brief).length,
        ),
      0,
    );
  const images = totalImages(scriptCount, effective);
  const costUsd = estimatePreviewCostUsd(scriptCount, effective, quality);
  const overCap = images > GENERATION_LIMITS.totalImages;
  const canStart = !submitting && !!source && scriptCount > 0 && !overCap;

  function selectSource(id: string) {
    setSourceId(id);
    setBriefIndexes(
      allBriefIndexes(sources?.find((item) => item.id === id) ?? null),
    );
  }

  function toggleBrief(index: number) {
    setBriefIndexes((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStart) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, briefIndexes, settings: effective }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.generation) {
        setError(body.error ?? "Could not start the generation.");
        setSubmitting(false);
        return;
      }
      router.push(`/generate/${body.generation.id}`);
    } catch {
      setError("Could not reach the server. Try again.");
      setSubmitting(false);
    }
  }

  if (!sources)
    return (
      <div
        role="status"
        className="flex min-w-0 flex-col gap-6 rounded-3xl border border-line-strong bg-background/60 p-5 backdrop-blur-xl sm:p-8"
      >
        <p className={`${labelClass} animate-pulse-soft`}>Loading analyses…</p>
        <span className="h-10 w-full animate-pulse rounded-xl bg-foreground/10" />
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-28 w-full animate-pulse rounded-2xl bg-foreground/5"
          />
        ))}
        <span className="h-12 w-full animate-pulse rounded-full bg-foreground/10" />
      </div>
    );
  if (sources.length === 0)
    return (
      <p className="min-w-0 rounded-3xl border border-dashed border-line-strong bg-background/60 px-6 py-10 text-center text-muted backdrop-blur-xl">
        {error && <span className="mr-2 font-mono text-[11px]">✕</span>}
        {error ??
          "No analysis with replication briefs yet. Finish an analysis run first."}
      </p>
    );

  const selectedBriefs = source
    ? source.briefs.filter((brief) => briefIndexes.includes(brief.index)).length
    : 0;
  const capShare = Math.min(images / GENERATION_LIMITS.totalImages, 1);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 animate-rise flex-col gap-10 rounded-3xl border border-line-strong bg-background/60 p-5 backdrop-blur-xl [animation-delay:150ms] sm:p-8"
    >
      <label className="flex min-w-0 flex-col gap-2">
        <span className={labelClass}>Analysis</span>
        <span className="relative flex min-w-0">
          <select
            value={sourceId}
            onChange={(event) => selectSource(event.target.value)}
            className={`${selectClass} truncate text-lg sm:text-xl`}
          >
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <SelectArrow />
        </span>
      </label>

      {source && (
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-3 w-full">
            <span className="flex items-baseline justify-between gap-4">
              <span className={labelClass}>Replication briefs</span>
              <span className={`${hintClass} tabular-nums`}>
                {selectedBriefs} / {source.briefs.length} selected
              </span>
            </span>
          </legend>
          {source.briefs.map((brief) => {
            const hairstyles = distinctHairstyles(brief);
            const checked = briefIndexes.includes(brief.index);
            const used = checked
              ? Math.min(effective.hairstylesPerBrief, hairstyles.length)
              : 0;
            return (
              <label
                key={brief.index}
                className={`relative flex min-w-0 cursor-pointer gap-4 rounded-2xl border p-4 wrap-break-word transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground sm:p-5 ${
                  checked
                    ? "border-foreground bg-foreground/[0.04]"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBrief(brief.index)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border text-[11px] leading-none transition-colors ${
                    checked
                      ? "border-foreground bg-foreground text-background"
                      : "border-line-strong"
                  }`}
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-3">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="font-mono text-xs text-muted">
                      Brief {String(brief.index + 1).padStart(2, "0")}
                    </span>
                    <span className="rounded-full bg-foreground px-2.5 py-0.5 text-xs text-background">
                      {brief.format.replace(/_/g, " ")}
                    </span>
                  </span>
                  <span
                    className={`font-display text-xl leading-snug sm:text-2xl ${checked ? "" : "text-foreground/70"}`}
                  >
                    {brief.hook}
                  </span>
                  <span className="flex flex-col gap-2">
                    <span className={`${hintClass} tracking-[0.2em] uppercase`}>
                      Hairstyles · {used} of {hairstyles.length} used
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {hairstyles.map((hairstyle, position) => (
                        <span
                          key={hairstyle}
                          className={`rounded-full px-2.5 py-0.5 text-xs ${
                            checked && position < effective.hairstylesPerBrief
                              ? "bg-foreground text-background"
                              : "border border-line text-muted"
                          }`}
                        >
                          {hairstyle}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="grid grid-cols-2 items-end gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6">
        {COUNT_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex min-w-0 flex-col gap-2">
            <span className={labelClass}>{label}</span>
            <input
              type="number"
              min={1}
              max={GENERATION_LIMITS[key]}
              value={settings[key]}
              onChange={(event) =>
                setSettings({ ...settings, [key]: Number(event.target.value) })
              }
              className={`${underlineClass} bg-transparent font-mono text-xl tabular-nums`}
            />
            <span className={hintClass}>1–{GENERATION_LIMITS[key]}</span>
          </label>
        ))}
        <label className="flex min-w-0 flex-col gap-2">
          <span className={labelClass}>Video length</span>
          <span className="relative flex min-w-0">
            <select
              value={settings.seconds}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  seconds: Number(
                    event.target.value,
                  ) as GenerationSettings["seconds"],
                })
              }
              className={`${selectClass} font-mono text-xl tabular-nums`}
            >
              {VIDEO_SECONDS.map((value) => (
                <option key={value} value={value}>
                  {value} s
                </option>
              ))}
            </select>
            <SelectArrow />
          </span>
          <span className={hintClass}>seconds</span>
        </label>
      </div>

      <div className="flex flex-col gap-5 border-t border-line pt-6">
        <p className="flex flex-wrap items-end gap-x-3 gap-y-4">
          <Term
            value={scriptCount}
            label={scriptCount === 1 ? "script" : "scripts"}
          />
          <Operator>×</Operator>
          <Term
            value={effective.takesPerScript}
            label={effective.takesPerScript === 1 ? "take" : "takes"}
          />
          <Operator>×</Operator>
          <Term value={FRAMES_PER_TAKE} label="frames" />
          <Operator>=</Operator>
          <Term value={images} label={images === 1 ? "image" : "images"} />
          {/* Reversed so the value sits on top but reads as "About $x". */}
          <span className="ml-auto flex flex-col-reverse items-end gap-1.5 pl-3">
            <span className={labelClass}>About</span>
            <span className="font-display text-4xl leading-none tabular-nums">
              ${costUsd.toFixed(2)}
            </span>
          </span>
        </p>
        <div className="flex flex-col gap-2">
          <div
            aria-hidden
            className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${overCap ? "hatch" : "bg-foreground"}`}
              style={{ width: `${capShare * 100}%` }}
            />
          </div>
          <p className="flex justify-between gap-4 font-mono text-[10px] tracking-[0.2em] text-muted uppercase tabular-nums">
            <span>Images per generation</span>
            <span className={overCap ? "text-foreground" : ""}>
              {images} / {GENERATION_LIMITS.totalImages}
            </span>
          </p>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Each take is a storyboard of a {effective.seconds} s video, rendered
          at {quality} quality. The estimate covers the rendered images; writing
          the scripts and sending frame 1 as the reference for frames 2 and 3
          add more OpenAI usage.
        </p>
      </div>
      {overCap && (
        <p className="flex gap-3 rounded-xl border border-foreground/50 px-4 py-3 text-sm">
          <span aria-hidden className="font-mono">
            ⚠
          </span>
          <span>
            This would create {images} images. The limit is{" "}
            {GENERATION_LIMITS.totalImages} per generation. Select fewer briefs,
            hairstyles or takes.
          </span>
        </p>
      )}
      {scriptCount === 0 && (
        <p className="text-sm text-muted">
          Select at least one brief to start.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={!canStart}
          className={`${buttonPrimary} w-full py-3.5 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`}
        >
          {submitting ? "Starting…" : "Start generation →"}
        </button>
        <p className="text-center font-mono text-[11px] text-muted">
          Each take renders in a minute or two, two at a time.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-line-strong px-4 py-3 text-sm"
        >
          <span className="mr-2 font-mono text-[11px]">✕</span>
          {error}
        </p>
      )}
    </form>
  );
}

function Term({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="font-display text-4xl leading-none tabular-nums">
        {value}
      </span>
      <span className={labelClass}>{label}</span>
    </span>
  );
}

function Operator({ children }: { children: ReactNode }) {
  return <span className="pb-5 font-mono text-sm text-subtle">{children}</span>;
}

function SelectArrow() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 font-mono text-sm text-muted"
    >
      ↓
    </span>
  );
}
