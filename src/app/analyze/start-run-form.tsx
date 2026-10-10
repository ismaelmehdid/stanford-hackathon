"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  estimateApifyCostUsd,
  MAX_SETTINGS,
  type RunSettings,
} from "@/lib/analysis/config";

const FIELDS: { key: keyof RunSettings; label: string }[] = [
  { key: "brandPostLimit", label: "Brand posts" },
  { key: "maxCreators", label: "Creators" },
  { key: "creatorPostLimit", label: "Posts per creator" },
];

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 font-normal dark:border-zinc-700 dark:bg-zinc-900";

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
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800"
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Brand Instagram URL
        <input
          required
          value={brandUrl}
          onChange={(event) => setBrandUrl(event.target.value)}
          className={`${inputClass} min-w-0`}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1 text-sm font-medium">
            {label} (max {MAX_SETTINGS[key]})
            <input
              type="number"
              min={1}
              max={MAX_SETTINGS[key]}
              value={settings[key]}
              onChange={(event) =>
                setSettings({ ...settings, [key]: Number(event.target.value) })
              }
              className={`${inputClass} w-32`}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start analysis"}
        </button>
        <p className="text-sm text-zinc-500">
          Apify cost up to ${estimateApifyCostUsd(settings).toFixed(2)}, plus
          OpenAI usage. Takes 5–15 minutes.
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
