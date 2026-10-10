"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  clampGenerationSettings,
  DEFAULT_GENERATION_SETTINGS,
  estimateSoraCostUsd,
  GENERATION_LIMITS,
  SORA_PRICE_PER_SECOND_USD,
  totalVideoSeconds,
  VIDEO_SECONDS,
  type GenerationSettings,
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

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 font-normal dark:border-zinc-700 dark:bg-zinc-900";

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

export function StartGenerationForm() {
  const router = useRouter();
  const [sources, setSources] = useState<GenerationSource[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [briefIndexes, setBriefIndexes] = useState<number[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>(
    DEFAULT_GENERATION_SETTINGS,
  );
  // The server's price for its SORA_MODEL; the browser cannot read that variable.
  const [pricePerSecondUsd, setPricePerSecondUsd] = useState(
    SORA_PRICE_PER_SECOND_USD,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/generation-sources", { cache: "no-store" })
      .then((response) => response.json())
      .then(
        (body: {
          sources?: GenerationSource[];
          soraPricePerSecondUsd?: number | null;
        }) => {
          const list = body.sources ?? [];
          const initial = defaultSource(list);
          if (typeof body.soraPricePerSecondUsd === "number")
            setPricePerSecondUsd(body.soraPricePerSecondUsd);
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
  const seconds = totalVideoSeconds(scriptCount, effective);
  const costUsd = estimateSoraCostUsd(
    scriptCount,
    effective,
    pricePerSecondUsd,
  );
  const overCap = seconds > GENERATION_LIMITS.totalSeconds;
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

  if (!sources) return <p className="text-zinc-500">Loading analyses…</p>;
  if (sources.length === 0)
    return (
      <p className="rounded-xl border border-zinc-200 p-4 text-zinc-500 sm:p-6 dark:border-zinc-800">
        {error ??
          "No analysis with replication briefs yet. Finish an analysis run first."}
      </p>
    );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800"
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Analysis
        <select
          value={sourceId}
          onChange={(event) => selectSource(event.target.value)}
          className={`${inputClass} min-w-0`}
        >
          {sources.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {source && (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            Replication briefs
          </legend>
          {source.briefs.map((brief) => {
            const hairstyles = distinctHairstyles(brief);
            const checked = briefIndexes.includes(brief.index);
            return (
              <label
                key={brief.index}
                className="flex min-w-0 cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 text-sm wrap-break-word hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBrief(brief.index)}
                  className="mt-1 shrink-0"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
                      {brief.format.replace(/_/g, " ")}
                    </span>{" "}
                    <span className="text-zinc-500">
                      Brief {brief.index + 1}
                    </span>
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {brief.hook}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {hairstyles.map((hairstyle, position) => (
                      <span
                        key={hairstyle}
                        className={
                          checked && position < effective.hairstylesPerBrief
                            ? "rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800"
                        }
                      >
                        {hairstyle}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-4">
        {COUNT_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1 text-sm font-medium">
            {label} (1–{GENERATION_LIMITS[key]})
            <input
              type="number"
              min={1}
              max={GENERATION_LIMITS[key]}
              value={settings[key]}
              onChange={(event) =>
                setSettings({ ...settings, [key]: Number(event.target.value) })
              }
              className={`${inputClass} w-32`}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Seconds per take
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
            className={`${inputClass} w-32`}
          >
            {VIDEO_SECONDS.map((value) => (
              <option key={value} value={value}>
                {value} s
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {scriptCount} {scriptCount === 1 ? "script" : "scripts"} ×{" "}
        {effective.takesPerScript}{" "}
        {effective.takesPerScript === 1 ? "take" : "takes"} ×{" "}
        {effective.seconds} s = {seconds} s ≈ ${costUsd.toFixed(2)} Sora, plus
        OpenAI usage for the scripts.
      </p>
      {overCap && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          This is over the {GENERATION_LIMITS.totalSeconds} s limit per
          generation. Select fewer briefs, hairstyles, takes or seconds.
        </p>
      )}
      {scriptCount === 0 && (
        <p className="text-sm text-zinc-500">
          Select at least one brief to start.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canStart}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start generation"}
        </button>
        <p className="text-sm text-zinc-500">
          Each take renders in a few minutes, two at a time.
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
