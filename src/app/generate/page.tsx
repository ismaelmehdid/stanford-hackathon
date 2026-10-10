import type { Metadata } from "next";
import { StrandsCanvas } from "@/components/three/strands-canvas";
import { Eyebrow } from "@/components/ui";
import { GenerationList } from "./generation-list";
import { StartGenerationForm } from "./start-generation-form";

export const metadata: Metadata = { title: "Video generation" };

export default function GeneratePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-clip border-b border-line">
        {/* The form can be tall, so the backdrop stays a fixed-height hero band. */}
        <StrandsCanvas
          className="absolute inset-x-0 top-0 -z-10 h-[40rem] sm:h-[48rem]"
          intensity={0.9}
        />
        <div className="absolute inset-x-0 top-0 -z-10 h-[40rem] bg-linear-to-b from-transparent via-transparent to-background sm:h-[48rem]" />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background/85 via-background/40 to-transparent" />
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16 lg:py-32">
          <div className="flex min-w-0 animate-rise flex-col gap-6 lg:sticky lg:top-24">
            <Eyebrow>Video generation</Eyebrow>
            <h1 className="font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl xl:text-8xl">
              Turn what works into <em>new</em> videos.
            </h1>
            <p className="max-w-lg text-lg text-muted">
              Pick an analysis and its briefs. Get a script per hairstyle and
              storyboard takes of each, then pick the best one.
            </p>
          </div>
          <StartGenerationForm />
        </div>
      </section>
      <section
        id="generations"
        className="mx-auto w-full max-w-7xl scroll-mt-14 px-4 py-16 sm:px-6 sm:py-24"
      >
        <GenerationList />
      </section>
    </main>
  );
}
