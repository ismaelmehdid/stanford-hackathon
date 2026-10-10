import type { Metadata } from "next";
import { RunList } from "./run-list";
import { StartRunForm } from "./start-run-form";

export const metadata: Metadata = { title: "Influencer video analysis" };

export default function AnalyzePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Influencer video analysis
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Paste a hair care brand&apos;s Instagram page. We find its influencer
          videos, compare each one with the brand&apos;s and the creator&apos;s
          usual videos, and explain what works.
        </p>
      </div>
      <StartRunForm />
      <RunList />
    </main>
  );
}
