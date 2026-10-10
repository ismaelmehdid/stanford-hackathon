import type { Metadata } from "next";
import { StrandsCanvas } from "@/components/three/strands-canvas";
import { Eyebrow } from "@/components/ui";
import { RunList } from "./run-list";
import { StartRunForm } from "./start-run-form";

export const metadata: Metadata = { title: "Influencer video analysis" };

export default function AnalyzePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden border-b border-line">
        <StrandsCanvas className="absolute inset-0 -z-10" intensity={0.9} />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background/85 via-background/40 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-transparent via-transparent to-background" />
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-end gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:py-32">
          <div className="flex animate-rise flex-col gap-6">
            <Eyebrow>New analysis</Eyebrow>
            <h1 className="font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
              Which influencer videos <em>actually</em> work?
            </h1>
            <p className="max-w-lg text-lg text-muted">
              Paste a hair care brand&apos;s Instagram page. We find its
              influencer videos, compare each one with the brand&apos;s and the
              creator&apos;s usual videos, and explain what works.
            </p>
          </div>
          <StartRunForm />
        </div>
      </section>
      <section
        id="runs"
        className="mx-auto w-full max-w-7xl scroll-mt-14 px-4 py-16 sm:px-6 sm:py-24"
      >
        <RunList />
      </section>
    </main>
  );
}
