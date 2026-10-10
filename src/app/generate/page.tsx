import type { Metadata } from "next";
import { GenerationList } from "./generation-list";
import { StartGenerationForm } from "./start-generation-form";

export const metadata: Metadata = { title: "Video generation" };

export default function GeneratePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Video generation
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Pick an analysis and the replication briefs to use. We write one
          script per hairstyle that keeps the winning format and emotional
          triggers, render several takes of each as a 3-frame storyboard that
          shows how the finished video would look, and you pick the best take.
        </p>
      </div>
      <StartGenerationForm />
      <GenerationList />
    </main>
  );
}
