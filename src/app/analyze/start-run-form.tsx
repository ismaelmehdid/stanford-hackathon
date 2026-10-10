"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonPrimary } from "@/components/ui";
import {
  estimateApifyCostUsd,
  MAX_SETTINGS,
  type RunSettings,
} from "@/lib/analysis/config";

const FIELDS: { key: keyof RunSettings; label: string }[] = [
  { key: "brandPostLimit", label: "Brand posts" },
  { key: "maxCreators", label: "Creators" },
  { key: "creatorPostLimit", label: "Per creator" },
];

const labelClass =
  "font-mono text-[10px] tracking-[0.2em] text-muted uppercase";

export function StartRunForm() {
  const router = useRouter();
  const [brandUrl, setBrandUrl] = useState(
    "https://www.instagram.com/headandshoulders",
  );
  const [settings, setSettings] = useState<RunSettings>(MAX_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandUrl, settings }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.run) {
        setError(body.error ?? "Could not start the run.");
        setSubmitting(false);
        return;
      }
      router.push(`/analyze/${body.run.id}`);
    } catch {
      setError("Could not reach the server. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex animate-rise flex-col gap-8 rounded-3xl border border-line-strong bg-background/60 p-6 backdrop-blur-xl [animation-delay:150ms] sm:p-8"
    >
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Brand Instagram URL</span>
        <input
          required
          value={brandUrl}
          onChange={(event) => setBrandUrl(event.target.value)}
          className="min-w-0 border-b border-line-strong bg-transparent py-2 text-xl outline-none placeholder:text-subtle focus:border-foreground"
          placeholder="https://www.instagram.com/brand"
        />
      </label>
      <div className="grid grid-cols-3 gap-4">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="flex min-w-0 flex-col gap-2">
            <span className={labelClass}>{label}</span>
            <input
              type="number"
              min={1}
              max={MAX_SETTINGS[key]}
              value={settings[key]}
              onChange={(event) =>
                setSettings({ ...settings, [key]: Number(event.target.value) })
              }
              className="w-full min-w-0 border-b border-line-strong bg-transparent py-2 font-mono text-xl tabular-nums outline-none focus:border-foreground"
            />
            <span className="font-mono text-[10px] text-subtle">
              max {MAX_SETTINGS[key]}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonPrimary} w-full py-3.5 text-base`}
        >
          {submitting ? "Starting…" : "Start analysis →"}
        </button>
        <p className="text-center font-mono text-[11px] text-muted">
          Apify up to ${estimateApifyCostUsd(settings).toFixed(2)} + OpenAI
          usage · 5–15 minutes
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
